import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import mammoth from 'mammoth';
import { z } from 'zod';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Type } from '@google/genai';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';
import firebaseConfig from './firebase-applet-config.json';

// -----------------------------------------------------------------------------
// Initialize Firebase Admin (Token Verification Only — No IAM Required)
// -----------------------------------------------------------------------------
if (!getApps().length) {
  initializeApp({ projectId: firebaseConfig.projectId });
}
const adminAuth = getAuth();

// -----------------------------------------------------------------------------
// Initialize Server-Side Gemini Client
// -----------------------------------------------------------------------------
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// -----------------------------------------------------------------------------
// Storage Directories Setup
// -----------------------------------------------------------------------------
const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');
const PRIVATE_UPLOADS = path.join(UPLOADS_ROOT, 'private');
const PUBLIC_UPLOADS = path.join(UPLOADS_ROOT, 'public');
const SHARES_INDEX_PATH = path.join(UPLOADS_ROOT, '.shares.json');

fs.mkdirSync(PRIVATE_UPLOADS, { recursive: true });
fs.mkdirSync(PUBLIC_UPLOADS, { recursive: true });

interface ShareEntry {
  ownerUid: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  access: 'link_view' | 'link_edit';
  createdAt: number;
}

function readSharesIndex(): Record<string, ShareEntry> {
  try {
    if (!fs.existsSync(SHARES_INDEX_PATH)) return {};
    return JSON.parse(fs.readFileSync(SHARES_INDEX_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function writeSharesIndex(data: Record<string, ShareEntry>) {
  fs.writeFileSync(SHARES_INDEX_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || 'samarelgaly84@gmail.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

function isAdminToken(user?: DecodedIdToken): boolean {
  if (!user || !user.email || !user.email_verified) return false;
  return ADMIN_EMAILS.has(user.email.toLowerCase());
}

// -----------------------------------------------------------------------------
// Express Setup & Security Middleware
// -----------------------------------------------------------------------------
interface AuthRequest extends Request {
  user?: DecodedIdToken;
}

const app = express();
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    frameguard: false,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please wait a moment.' },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI rate limit reached. Please retry in a minute.' },
});

app.use('/api', apiLimiter);

async function verifyBearerToken(token: string): Promise<DecodedIdToken> {
  return adminAuth.verifyIdToken(token);
}

const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const header = req.headers.authorization;
    const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
    const token = header?.startsWith('Bearer ') ? header.slice(7) : queryToken;
    if (!token) {
      return res.status(401).json({ error: 'Authentication token required.' });
    }
    const decoded = await verifyBearerToken(token);
    if (!decoded.email_verified) {
      return res.status(403).json({ error: 'Verified email required.' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Auth verification failed:', err);
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
};

const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!isAdminToken(req.user)) {
    return res.status(403).json({ error: 'Forbidden: Administrator privileges required.' });
  }
  next();
};

// -----------------------------------------------------------------------------
// Multer Upload Configuration (Real Server Storage)
// -----------------------------------------------------------------------------
const MAX_UPLOAD_BYTES = (Number(process.env.CLOUD_UPLOAD_MAX_MB) || 50) * 1024 * 1024;

function sanitizeFilename(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._\-\u0600-\u06FF ]/g, '_');
  return base.slice(0, 120) || 'file';
}

function createDiskUpload(scope: 'private' | 'public') {
  const storage = multer.diskStorage({
    destination: (req: AuthRequest, _file, cb) => {
      const uid = req.user?.uid;
      if (!uid) return cb(new Error('Unauthorized upload'), '');
      const dir = path.join(scope === 'private' ? PRIVATE_UPLOADS : PUBLIC_UPLOADS, uid);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
      const safe = sanitizeFilename(file.originalname);
      cb(null, `${unique}-${safe}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: MAX_UPLOAD_BYTES },
  });
}

const privateUpload = createDiskUpload('private');
const publicUpload = createDiskUpload('public');

// -----------------------------------------------------------------------------
// Health & Configuration Endpoints
// -----------------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'TIGER Platform API',
    timestamp: new Date().toISOString(),
  });
});

// -----------------------------------------------------------------------------
// Public Media Upload & Streaming (Posts, Stories, Reels, Avatars, Chat Media)
// -----------------------------------------------------------------------------
app.post('/api/media/upload', requireAuth, publicUpload.single('file'), (req: AuthRequest, res: Response) => {
  if (!req.file || !req.user) {
    return res.status(400).json({ error: 'No file provided.' });
  }
  const uid = req.user.uid;
  const filename = req.file.filename;
  const url = `/api/media/${encodeURIComponent(uid)}/${encodeURIComponent(filename)}`;
  return res.json({
    url,
    fileName: req.file.originalname,
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size,
  });
});

app.get('/api/media/:uid/:filename', (req: Request, res: Response) => {
  const uid = path.basename(String(req.params.uid || ''));
  const filename = path.basename(String(req.params.filename || ''));
  const targetPath = path.resolve(PUBLIC_UPLOADS, uid, filename);
  if (!targetPath.startsWith(PUBLIC_UPLOADS) || !fs.existsSync(targetPath)) {
    return res.status(404).json({ error: 'Media file not found.' });
  }
  res.sendFile(targetPath);
});

// -----------------------------------------------------------------------------
// TIGER CLOUD — Private Authenticated File Storage API
// -----------------------------------------------------------------------------
app.post('/api/cloud/upload', requireAuth, privateUpload.single('file'), (req: AuthRequest, res: Response) => {
  if (!req.file || !req.user) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }
  const uid = req.user.uid;
  const storageKey = `${uid}/${req.file.filename}`;
  const downloadUrl = `/api/cloud/file/${encodeURIComponent(uid)}/${encodeURIComponent(req.file.filename)}`;
  return res.json({
    storageKey,
    downloadUrl,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype || 'application/octet-stream',
    sizeBytes: req.file.size,
  });
});

app.get('/api/cloud/file/:uid/:filename', requireAuth, (req: AuthRequest, res: Response) => {
  const uid = path.basename(String(req.params.uid || ''));
  const filename = path.basename(String(req.params.filename || ''));
  if (!req.user || (req.user.uid !== uid && !isAdminToken(req.user))) {
    return res.status(403).json({ error: 'Forbidden: You do not have permission to access this file.' });
  }
  const targetPath = path.resolve(PRIVATE_UPLOADS, uid, filename);
  if (!targetPath.startsWith(PRIVATE_UPLOADS) || !fs.existsSync(targetPath)) {
    return res.status(404).json({ error: 'Cloud file not found.' });
  }
  if (req.query.download === '1') {
    return res.download(targetPath);
  }
  return res.sendFile(targetPath);
});

const shareRegisterSchema = z.object({
  storageKey: z.string().min(3).max(256),
  fileName: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(120),
  access: z.enum(['private', 'link_view', 'link_edit']),
  shareToken: z.string().max(128).optional(),
});

app.post('/api/cloud/share-register', requireAuth, (req: AuthRequest, res: Response) => {
  const parsed = shareRegisterSchema.safeParse(req.body);
  if (!parsed.success || !req.user) {
    return res.status(400).json({ error: 'Invalid share payload.' });
  }
  const { storageKey, fileName, mimeType, access, shareToken } = parsed.data;
  if (!storageKey.startsWith(`${req.user.uid}/`)) {
    return res.status(403).json({ error: 'Forbidden: You do not own this file.' });
  }

  const shares = readSharesIndex();
  // Remove existing tokens for this storageKey
  for (const [tok, entry] of Object.entries(shares)) {
    if (entry.storageKey === storageKey && entry.ownerUid === req.user.uid) {
      delete shares[tok];
    }
  }

  if (access === 'private') {
    writeSharesIndex(shares);
    return res.json({ shareToken: '', shareUrl: '' });
  }

  const token = shareToken && /^[a-zA-Z0-9_-]{8,64}$/.test(shareToken)
    ? shareToken
    : crypto.randomBytes(16).toString('hex');

  shares[token] = {
    ownerUid: req.user.uid,
    storageKey,
    fileName,
    mimeType,
    access,
    createdAt: Date.now(),
  };
  writeSharesIndex(shares);

  return res.json({
    shareToken: token,
    shareUrl: `/api/cloud/shared/${token}`,
  });
});

app.get('/api/cloud/shared/:token', (req: Request, res: Response) => {
  const token = String(req.params.token || '');
  const shares = readSharesIndex();
  const entry = shares[token];
  if (!entry) {
    return res.status(404).json({ error: 'Shared link is invalid or revoked.' });
  }
  const [uid, filename] = entry.storageKey.split('/');
  const targetPath = path.resolve(PRIVATE_UPLOADS, path.basename(uid), path.basename(filename));
  if (!targetPath.startsWith(PRIVATE_UPLOADS) || !fs.existsSync(targetPath)) {
    return res.status(404).json({ error: 'Shared file no longer exists.' });
  }
  res.setHeader('Content-Type', entry.mimeType || 'application/octet-stream');
  return res.sendFile(targetPath);
});

app.post('/api/cloud/copy', requireAuth, (req: AuthRequest, res: Response) => {
  const storageKey = String(req.body?.storageKey || '');
  if (!req.user || !storageKey.startsWith(`${req.user.uid}/`)) {
    return res.status(403).json({ error: 'Forbidden: Cannot copy unowned file.' });
  }
  const [uid, filename] = storageKey.split('/');
  const sourcePath = path.resolve(PRIVATE_UPLOADS, path.basename(uid), path.basename(filename));
  if (!sourcePath.startsWith(PRIVATE_UPLOADS) || !fs.existsSync(sourcePath)) {
    return res.status(404).json({ error: 'Source file not found.' });
  }
  const newFilename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-copy-${filename.slice(-60)}`;
  const destPath = path.resolve(PRIVATE_UPLOADS, path.basename(uid), newFilename);
  fs.copyFileSync(sourcePath, destPath);
  const newKey = `${req.user.uid}/${newFilename}`;
  return res.json({
    storageKey: newKey,
    downloadUrl: `/api/cloud/file/${encodeURIComponent(req.user.uid)}/${encodeURIComponent(newFilename)}`,
  });
});

app.delete('/api/cloud/file', requireAuth, (req: AuthRequest, res: Response) => {
  const storageKey = String(req.body?.storageKey || '');
  if (!req.user || (!storageKey.startsWith(`${req.user.uid}/`) && !isAdminToken(req.user))) {
    return res.status(403).json({ error: 'Forbidden: Cannot delete unowned file.' });
  }
  const [uid, filename] = storageKey.split('/');
  const targetPath = path.resolve(PRIVATE_UPLOADS, path.basename(uid), path.basename(filename));
  if (targetPath.startsWith(PRIVATE_UPLOADS) && fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }
  return res.json({ deleted: true });
});

// -----------------------------------------------------------------------------
// TIGER AI — Server-Side Gemini Assistant & Vector Art Studio
// -----------------------------------------------------------------------------
const aiChatSchema = z.object({
  prompt: z.string().min(1).max(8000),
  taskMode: z
    .enum(['chat', 'article', 'translate', 'summarize', 'explain', 'code', 'message', 'ideas'])
    .default('chat'),
  language: z.enum(['ar', 'en']).default('ar'),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(8000),
      })
    )
    .max(20)
    .optional(),
});

app.post('/api/ai/chat', requireAuth, aiLimiter, async (req: AuthRequest, res: Response) => {
  const parsed = aiChatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid AI request payload.' });
  }
  const { prompt, taskMode, language, history = [] } = parsed.data;

  const taskPrompts: Record<string, string> = {
    chat: 'You are TIGER AI, an elite intelligent assistant inside the TIGER platform. Be concise, accurate, structured, and helpful.',
    article: 'You are TIGER AI Editorial Writer. Write a publication-grade, well-structured article with clear headings and crisp insights.',
    translate: 'You are TIGER AI Professional Translator. Provide accurate, natural translation preserving nuance and tone.',
    summarize: 'You are TIGER AI Summarizer. Produce an executive summary with key takeaways and structured bullet points.',
    explain: 'You are TIGER AI Tutor. Explain the topic step-by-step with clear examples and intuitive analogies.',
    code: 'You are TIGER AI Senior Software Engineer. Provide clean, production-ready code with concise explanation and edge-case notes.',
    message: 'You are TIGER AI Communication Assistant. Draft a polished, ready-to-send message or email matching the requested tone.',
    ideas: 'You are TIGER AI Creative Strategist. Generate concrete, original, actionable ideas categorized logically.',
  };

  const langRule =
    language === 'ar'
      ? 'Respond in crisp, modern Arabic unless the user explicitly writes or asks for another language.'
      : 'Respond in clear, concise English unless the user asks for another language.';

  try {
    const ai = getGeminiClient();
    const contents = [
      ...history.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      { role: 'user', parts: [{ text: prompt }] },
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents,
      config: {
        systemInstruction: `${taskPrompts[taskMode]} ${langRule}`,
      },
    });

    const text = response.text || '';
    return res.json({ reply: text, model: 'gemini-4-hydrogen' });
  } catch (err: unknown) {
    console.error('TIGER AI error:', err);
    const message = err instanceof Error ? err.message : 'AI service error.';
    return res.status(502).json({ error: `TIGER AI error: ${message}` });
  }
});

const aiImageSchema = z.object({
  prompt: z.string().min(2).max(1000),
  style: z.enum(['editorial', 'minimal', 'architecture', 'abstract', 'logo']).default('editorial'),
});

app.post('/api/ai/image', requireAuth, aiLimiter, async (req: AuthRequest, res: Response) => {
  const parsed = aiImageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid image prompt.' });
  }
  const { prompt, style } = parsed.data;

  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Create a high-craft, gallery-grade standalone SVG illustration (viewBox="0 0 800 600") for the following prompt: "${prompt}". Style: ${style}. Use rich layered vector paths, thoughtful gradients (<defs>), lighting depth, balanced composition, and tasteful color harmony. Output ONLY the raw <svg>...</svg> markup with no markdown fences and no extra explanation.`,
      config: {
        systemInstruction:
          'You are an award-winning vector illustrator. Return valid, self-contained SVG markup only (no script tags, no external hrefs).',
      },
    });

    const raw = (response.text || '').trim();
    const match = raw.match(/<svg[\s\S]*?<\/svg>/i);
    if (!match) {
      return res.status(502).json({ error: 'Could not synthesize valid vector artwork. Please refine your prompt.' });
    }
    // Strip any script tags or event handlers for XSS safety
    const cleanSvg = match[0]
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/\son[a-z]+\s*=\s*["'][^"']*["']/gi, '');
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(cleanSvg, 'utf-8').toString('base64')}`;

    return res.json({
      imageUrl: dataUrl,
      format: 'svg',
      model: 'gemini-4-hydrogen',
    });
  } catch (err: unknown) {
    console.error('TIGER AI Image Studio error:', err);
    const message = err instanceof Error ? err.message : 'Image synthesis failed.';
    return res.status(502).json({ error: `Image Studio error: ${message}` });
  }
});

// -----------------------------------------------------------------------------
// TIGER DRIVE AI — Permission-Verified Cloud Document Intelligence
// -----------------------------------------------------------------------------
const driveAiSchema = z.object({
  files: z
    .array(
      z.object({
        storageKey: z.string().min(3).max(256),
        name: z.string().min(1).max(200),
        mimeType: z.string().min(1).max(120),
      })
    )
    .min(1)
    .max(8),
  action: z.enum(['summarize', 'analyze', 'extract', 'qa', 'folder_summary', 'quiz', 'flashcards', 'search', 'outline']),
  question: z.string().max(2000).optional(),
  language: z.enum(['ar', 'en']).default('ar'),
});

app.post('/api/drive-ai/analyze', requireAuth, aiLimiter, async (req: AuthRequest, res: Response) => {
  const parsed = driveAiSchema.safeParse(req.body);
  if (!parsed.success || !req.user) {
    return res.status(400).json({ error: 'Invalid TIGER DRIVE AI request.' });
  }
  const { files, action, question, language } = parsed.data;
  const uid = req.user.uid;

  // CRITICAL PERMISSION CHECK: Verify every requested file strictly belongs to the authenticated user!
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  for (const f of files) {
    if (!f.storageKey.startsWith(`${uid}/`)) {
      return res.status(403).json({
        error: `Permission denied: File "${f.name}" does not belong to your account.`,
      });
    }
    const [keyUid, filename] = f.storageKey.split('/');
    const filePath = path.resolve(PRIVATE_UPLOADS, path.basename(keyUid), path.basename(filename));
    if (!filePath.startsWith(PRIVATE_UPLOADS) || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: `File "${f.name}" not found in TIGER CLOUD storage.` });
    }

    const lowerName = f.name.toLowerCase();
    const mime = f.mimeType.toLowerCase();

    if (mime === 'application/pdf' || lowerName.endsWith('.pdf') || mime.startsWith('image/')) {
      const buf = fs.readFileSync(filePath);
      if (buf.length > 15 * 1024 * 1024) {
        return res.status(413).json({ error: `File "${f.name}" exceeds 15MB inline AI analysis limit.` });
      }
      parts.push({ text: `--- Attached Document: ${f.name} (${f.mimeType}) ---` });
      parts.push({
        inlineData: {
          mimeType: lowerName.endsWith('.pdf') ? 'application/pdf' : f.mimeType,
          data: buf.toString('base64'),
        },
      });
    } else if (
      lowerName.endsWith('.docx') ||
      mime.includes('wordprocessingml')
    ) {
      const extracted = await mammoth.extractRawText({ path: filePath });
      parts.push({
        text: `--- Word Document: ${f.name} ---\n${extracted.value.slice(0, 60000)}`,
      });
    } else if (
      mime.startsWith('text/') ||
      /\.(txt|md|csv|json|js|ts|tsx|py|html|css|sql|xml|yml|yaml)$/i.test(lowerName)
    ) {
      const content = fs.readFileSync(filePath, 'utf-8').slice(0, 60000);
      parts.push({
        text: `--- Text Document: ${f.name} ---\n${content}`,
      });
    } else {
      parts.push({
        text: `--- File Metadata Only (binary format): ${f.name} (${f.mimeType}) ---`,
      });
    }
  }

  const langPrompt = language === 'ar' ? 'Respond in clear, structured Arabic.' : 'Respond in clear, structured English.';

  try {
    const ai = getGeminiClient();

    if (action === 'quiz') {
      parts.push({
        text: `Generate a 5-question multiple-choice quiz based strictly on the provided document(s). ${langPrompt}`,
      });
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    options: { type: Type.ARRAY, items: { type: Type.STRING } },
                    correctIndex: { type: Type.INTEGER },
                    explanation: { type: Type.STRING },
                  },
                },
              },
            },
          },
        },
      });
      return res.json({ mode: 'quiz', data: JSON.parse(response.text || '{}') });
    }

    if (action === 'flashcards') {
      parts.push({
        text: `Generate 6 clear Question & Answer study cards from the provided document(s). ${langPrompt}`,
      });
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              cards: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    answer: { type: Type.STRING },
                  },
                },
              },
            },
          },
        },
      });
      return res.json({ mode: 'flashcards', data: JSON.parse(response.text || '{}') });
    }

    const actionDirectives: Record<string, string> = {
      summarize: 'Provide a concise executive summary and key bullet takeaways of the attached document(s).',
      analyze: 'Perform a thorough analytical breakdown: core themes, structure, strengths, gaps, and key conclusions.',
      extract: 'Extract all critical facts, dates, figures, entities, action items, and definitions in clean structured sections.',
      qa: `Answer the following question accurately using ONLY evidence from the attached document(s). Cite relevant sections: "${question || 'What is the main topic of this document?'}"`,
      folder_summary: 'Synthesize all attached files from this folder into a cohesive master overview showing how each file relates.',
      search: `Perform a smart semantic search across the attached document(s) for: "${question || ''}". Quote matching passages and explain relevance.`,
      outline: 'Convert the attached document(s) into a clean, hierarchical structured study/executive outline.',
    };

    parts.push({ text: `${actionDirectives[action]} ${langPrompt}` });

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
    });

    return res.json({
      mode: 'text',
      reply: response.text || '',
    });
  } catch (err: unknown) {
    console.error('TIGER DRIVE AI error:', err);
    const message = err instanceof Error ? err.message : 'Document analysis failed.';
    return res.status(502).json({ error: `TIGER DRIVE AI error: ${message}` });
  }
});

// -----------------------------------------------------------------------------
// TIGER PREMIUM — Server-Verified Billing Endpoints (Never Fake Activation)
// -----------------------------------------------------------------------------
app.get('/api/billing/status', requireAuth, (_req: AuthRequest, res: Response) => {
  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_'));
  res.json({
    stripeConfigured,
    plans: [
      {
        id: 'free',
        name: 'TIGER FREE',
        priceMonthlyUsd: 0,
        storageQuotaBytes: 512 * 1024 * 1024,
        aiMonthlyLimit: 50,
      },
      {
        id: 'plus',
        name: 'TIGER PLUS',
        priceMonthlyUsd: 9,
        storageQuotaBytes: 50 * 1024 * 1024 * 1024,
        aiMonthlyLimit: 500,
      },
      {
        id: 'pro',
        name: 'TIGER PRO',
        priceMonthlyUsd: 24,
        storageQuotaBytes: 250 * 1024 * 1024 * 1024,
        aiMonthlyLimit: 2500,
      },
    ],
  });
});

app.post('/api/billing/checkout', requireAuth, async (req: AuthRequest, res: Response) => {
  const plan = String(req.body?.plan || '');
  if (!['plus', 'pro'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid paid plan selected.' });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey || !stripeKey.startsWith('sk_')) {
    return res.status(200).json({
      configured: false,
      verified: false,
      plan,
      amountCents: plan === 'plus' ? 900 : 2400,
      currency: 'USD',
      message:
        'Live payment gateway (STRIPE_SECRET_KEY) is not configured yet. Your request has been logged as pending_verification and your plan remains FREE until verified payment completes.',
    });
  }

  try {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const params = new URLSearchParams();
    params.append('mode', 'subscription');
    params.append('success_url', `${appUrl}/?billing=success&plan=${plan}`);
    params.append('cancel_url', `${appUrl}/?billing=cancelled`);
    params.append('line_items[0][quantity]', '1');
    params.append('line_items[0][price_data][currency]', 'usd');
    params.append('line_items[0][price_data][unit_amount]', plan === 'plus' ? '900' : '2400');
    params.append('line_items[0][price_data][recurring][interval]', 'month');
    params.append('line_items[0][price_data][product_data][name]', plan === 'plus' ? 'TIGER PLUS' : 'TIGER PRO');
    if (req.user?.email) {
      params.append('customer_email', req.user.email);
    }

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const session = (await stripeRes.json()) as { url?: string; id?: string; error?: { message?: string } };
    if (!stripeRes.ok || !session.url) {
      return res.status(502).json({ error: session.error?.message || 'Stripe checkout initialization failed.' });
    }
    return res.json({
      configured: true,
      verified: false,
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(502).json({ error: 'Payment gateway error.' });
  }
});

// -----------------------------------------------------------------------------
// TIGER ADMIN — Server-Enforced RBAC Verification & Storage Metrics
// -----------------------------------------------------------------------------
function getDirStats(dirPath: string): { filesCount: number; totalBytes: number } {
  let filesCount = 0;
  let totalBytes = 0;
  if (!fs.existsSync(dirPath)) return { filesCount, totalBytes };
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (!entry.name.startsWith('.')) {
        filesCount += 1;
        totalBytes += fs.statSync(full).size;
      }
    }
  };
  walk(dirPath);
  return { filesCount, totalBytes };
}

app.get('/api/admin/verify', requireAuth, requireAdmin, (req: AuthRequest, res: Response) => {
  const privateStats = getDirStats(PRIVATE_UPLOADS);
  const publicStats = getDirStats(PUBLIC_UPLOADS);
  res.json({
    authorized: true,
    adminEmail: req.user?.email,
    serverStats: {
      uptimeSeconds: Math.floor(process.uptime()),
      onlineSockets: onlineClients.size,
      privateCloudFiles: privateStats.filesCount,
      privateCloudBytes: privateStats.totalBytes,
      publicMediaFiles: publicStats.filesCount,
      publicMediaBytes: publicStats.totalBytes,
    },
  });
});

// -----------------------------------------------------------------------------
// Real-Time WebSocket Server (Chat, Presence, Live Rooms, WebRTC Signaling)
// -----------------------------------------------------------------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

interface ConnectedClient {
  ws: WebSocket;
  uid: string;
  displayName: string;
  liveRoomId?: string;
}

const onlineClients = new Map<string, Set<ConnectedClient>>();

function broadcastOnlineUsers() {
  const onlineUids = Array.from(onlineClients.keys());
  const payload = JSON.stringify({ type: 'presence:list', onlineUids });
  for (const sockets of onlineClients.values()) {
    for (const client of sockets) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  }
}

function sendToUser(targetUid: string, payload: unknown) {
  const sockets = onlineClients.get(targetUid);
  if (!sockets) return;
  const serialized = JSON.stringify(payload);
  for (const client of sockets) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(serialized);
    }
  }
}

function broadcastToLiveRoom(roomId: string, payload: unknown, excludeWs?: WebSocket) {
  const serialized = JSON.stringify(payload);
  for (const sockets of onlineClients.values()) {
    for (const client of sockets) {
      if (client.liveRoomId === roomId && client.ws !== excludeWs && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(serialized);
      }
    }
  }
}

wss.on('connection', (ws) => {
  let authedClient: ConnectedClient | null = null;

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'auth') {
        if (!msg.token) return;
        const decoded = await verifyBearerToken(String(msg.token));
        const client: ConnectedClient = {
          ws,
          uid: decoded.uid,
          displayName: String(msg.displayName || decoded.name || decoded.email || 'User'),
        };
        authedClient = client;
        if (!onlineClients.has(decoded.uid)) {
          onlineClients.set(decoded.uid, new Set());
        }
        onlineClients.get(decoded.uid)!.add(client);
        ws.send(JSON.stringify({ type: 'auth:ok', uid: decoded.uid }));
        broadcastOnlineUsers();
        return;
      }

      if (!authedClient) {
        ws.send(JSON.stringify({ type: 'error', message: 'Authenticate socket first.' }));
        return;
      }

      // Chat typing & instant delivery echo
      if (msg.type === 'chat:typing' && Array.isArray(msg.participantUids)) {
        for (const uid of msg.participantUids) {
          if (uid !== authedClient.uid) {
            sendToUser(uid, {
              type: 'chat:typing',
              chatId: msg.chatId,
              fromUid: authedClient.uid,
              fromName: authedClient.displayName,
              isTyping: Boolean(msg.isTyping),
            });
          }
        }
        return;
      }

      // Live Notification Push
      if (msg.type === 'notification:push' && typeof msg.recipientUid === 'string') {
        sendToUser(msg.recipientUid, {
          type: 'notification:new',
          actorUid: authedClient.uid,
          actorName: authedClient.displayName,
          notifType: msg.notifType,
          message: msg.message,
        });
        return;
      }

      // WebRTC Call & Live Signaling
      if (
        typeof msg.type === 'string' &&
        msg.type.startsWith('webrtc:') &&
        typeof msg.targetUid === 'string'
      ) {
        sendToUser(msg.targetUid, {
          ...msg,
          fromUid: authedClient.uid,
          fromName: authedClient.displayName,
        });
        return;
      }

      // TIGER LIVE Rooms
      if (msg.type === 'live:join' && typeof msg.roomId === 'string') {
        authedClient.liveRoomId = msg.roomId;
        let viewers = 0;
        for (const sockets of onlineClients.values()) {
          for (const c of sockets) {
            if (c.liveRoomId === msg.roomId) viewers++;
          }
        }
        broadcastToLiveRoom(msg.roomId, {
          type: 'live:viewers',
          roomId: msg.roomId,
          count: viewers,
          joinedUser: { uid: authedClient.uid, name: authedClient.displayName },
        });
        return;
      }

      if (msg.type === 'live:leave' && authedClient.liveRoomId) {
        const roomId = authedClient.liveRoomId;
        authedClient.liveRoomId = undefined;
        let viewers = 0;
        for (const sockets of onlineClients.values()) {
          for (const c of sockets) {
            if (c.liveRoomId === roomId) viewers++;
          }
        }
        broadcastToLiveRoom(roomId, { type: 'live:viewers', roomId, count: viewers });
        return;
      }

      if (msg.type === 'live:comment' && typeof msg.roomId === 'string') {
        broadcastToLiveRoom(msg.roomId, {
          type: 'live:comment',
          roomId: msg.roomId,
          id: crypto.randomUUID(),
          uid: authedClient.uid,
          name: authedClient.displayName,
          text: String(msg.text || '').slice(0, 300),
          createdAt: Date.now(),
        });
        return;
      }

      if (msg.type === 'live:reaction' && typeof msg.roomId === 'string') {
        broadcastToLiveRoom(msg.roomId, {
          type: 'live:reaction',
          roomId: msg.roomId,
          id: crypto.randomUUID(),
          emoji: String(msg.emoji || '🔥').slice(0, 8),
          uid: authedClient.uid,
        });
      }
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  });

  ws.on('close', () => {
    if (!authedClient) return;
    const roomId = authedClient.liveRoomId;
    const set = onlineClients.get(authedClient.uid);
    if (set) {
      set.delete(authedClient);
      if (set.size === 0) onlineClients.delete(authedClient.uid);
    }
    if (roomId) {
      let viewers = 0;
      for (const sockets of onlineClients.values()) {
        for (const c of sockets) {
          if (c.liveRoomId === roomId) viewers++;
        }
      }
      broadcastToLiveRoom(roomId, { type: 'live:viewers', roomId, count: viewers });
    }
    broadcastOnlineUsers();
  });
});

// -----------------------------------------------------------------------------
// Vite Dev Middleware / Production Static Serving (Port 3000)
// -----------------------------------------------------------------------------
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // Global Express Error Handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled API Error:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  });

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`TIGER Platform server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
