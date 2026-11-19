import React, { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import {
  Sparkles,
  Send,
  Plus,
  Trash2,
  FileText,
  Image as ImageIcon,
  ShieldCheck,
  BookOpen,
  HelpCircle,
  Search,
  ListTree,
  Folder,
  Download,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { db, getAuthHeader, handleFirestoreError, OperationType } from '../lib/firebase';
import { useTiger } from '../context/TigerContext';
import {
  AiConversationItem,
  AiMessageItem,
  CloudFileItem,
  CloudFolderItem,
  DriveFlashcardsData,
  DriveQuizData,
} from '../types/tiger';
import { formatBytes } from '../lib/upload';

const AI_MODES = [
  { id: 'chat', ar: 'محادثة ذكية', en: 'Smart Chat' },
  { id: 'article', ar: 'كتابة مقال', en: 'Article' },
  { id: 'translate', ar: 'ترجمة', en: 'Translate' },
  { id: 'summarize', ar: 'تلخيص', en: 'Summarize' },
  { id: 'explain', ar: 'شرح درس', en: 'Explain Lesson' },
  { id: 'code', ar: 'مساعدة برمجية', en: 'Code Helper' },
  { id: 'message', ar: 'صياغة رسالة', en: 'Draft Message' },
  { id: 'ideas', ar: 'توليد أفكار', en: 'Brainstorm' },
] as const;

type DriveAction =
  | 'summarize'
  | 'analyze'
  | 'extract'
  | 'qa'
  | 'folder_summary'
  | 'quiz'
  | 'flashcards'
  | 'search'
  | 'outline';

export function AiModule({ initialTab }: { initialTab: 'chat' | 'drive' }) {
  const {
    firebaseUser,
    lang,
    t,
    pushToast,
    driveAiPreselectIds,
  } = useTiger();

  const [tab, setTab] = useState<'chat' | 'image' | 'drive'>(initialTab);

  // Sync tab when sidebar switches between TIGER AI and DRIVE AI
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  // TIGER AI Conversations
  const [conversations, setConversations] = useState<AiConversationItem[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessageItem[]>([]);
  const [prompt, setPrompt] = useState('');
  const [taskMode, setTaskMode] = useState<(typeof AI_MODES)[number]['id']>('chat');
  const [sending, setSending] = useState(false);

  // Image Studio State
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageStyle, setImageStyle] = useState<'editorial' | 'minimal' | 'architecture' | 'abstract' | 'logo'>('editorial');
  const [generatedImages, setGeneratedImages] = useState<Array<{ prompt: string; url: string }>>([]);
  const [generatingImg, setGeneratingImg] = useState(false);

  // DRIVE AI State
  const [cloudFiles, setCloudFiles] = useState<CloudFileItem[]>([]);
  const [cloudFolders, setCloudFolders] = useState<CloudFolderItem[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [driveAction, setDriveAction] = useState<DriveAction>('summarize');
  const [driveQuestion, setDriveQuestion] = useState('');
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveTextResult, setDriveTextResult] = useState('');
  const [driveQuiz, setDriveQuiz] = useState<DriveQuizData | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [driveCards, setDriveCards] = useState<DriveFlashcardsData | null>(null);
  const [revealedCards, setRevealedCards] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (driveAiPreselectIds.length > 0) {
      setSelectedFileIds(driveAiPreselectIds);
    }
  }, [driveAiPreselectIds]);

  // Load saved AI conversations & user's own Cloud files
  useEffect(() => {
    if (!firebaseUser) return;
    const cq = query(collection(db, 'aiConversations'), where('ownerUid', '==', firebaseUser.uid));
    const unsubC = onSnapshot(
      cq,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<AiConversationItem, 'id'>) }))
          .sort(
            (a, b) =>
              (b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0) -
              (a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0)
          );
        setConversations(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'aiConversations')
    );

    const fq = query(collection(db, 'cloudFiles'), where('ownerUid', '==', firebaseUser.uid));
    const unsubF = onSnapshot(
      fq,
      (snap) => {
        setCloudFiles(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<CloudFileItem, 'id'>) }))
            .filter((f) => !f.isTrashed)
        );
      },
      () => {}
    );

    const flq = query(collection(db, 'cloudFolders'), where('ownerUid', '==', firebaseUser.uid));
    const unsubFl = onSnapshot(
      flq,
      (snap) => {
        setCloudFolders(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<CloudFolderItem, 'id'>) }))
            .filter((f) => !f.isTrashed)
        );
      },
      () => {}
    );

    return () => {
      unsubC();
      unsubF();
      unsubFl();
    };
  }, [firebaseUser]);

  // Load messages for active AI conversation
  useEffect(() => {
    if (!firebaseUser || !activeConvId) {
      setMessages([]);
      return;
    }
    const mq = query(
      collection(db, 'aiConversations', activeConvId, 'messages'),
      where('ownerUid', '==', firebaseUser.uid)
    );
    const unsub = onSnapshot(
      mq,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<AiMessageItem, 'id'>) }))
          .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
        setMessages(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `aiConversations/${activeConvId}/messages`)
    );
    return () => unsub();
  }, [firebaseUser, activeConvId]);

  const createConversation = async (title: string): Promise<string> => {
    if (!firebaseUser) throw new Error('Not authenticated');
    const ref = await addDoc(collection(db, 'aiConversations'), {
      ownerUid: firebaseUser.uid,
      title: title.slice(0, 150),
      mode: 'chat',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setActiveConvId(ref.id);
    return ref.id;
  };

  const handleSendAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !prompt.trim() || sending) return;
    const text = prompt.trim();
    setPrompt('');
    setSending(true);

    try {
      const convId = activeConvId || (await createConversation(text.slice(0, 60)));

      await addDoc(collection(db, 'aiConversations', convId, 'messages'), {
        ownerUid: firebaseUser.uid,
        role: 'user',
        content: text,
        createdAt: serverTimestamp(),
      });

      const headers = await getAuthHeader();
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          taskMode,
          language: lang,
          history: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'TIGER AI request failed');

      await addDoc(collection(db, 'aiConversations', convId, 'messages'), {
        ownerUid: firebaseUser.uid,
        role: 'assistant',
        content: String(data.reply || ''),
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'aiConversations', convId), { updatedAt: serverTimestamp() });
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        aiRequestsCount: increment(1),
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'TIGER AI error', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleGenerateImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !imagePrompt.trim() || generatingImg) return;
    setGeneratingImg(true);
    try {
      const headers = await getAuthHeader();
      const res = await fetch('/api/ai/image', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: imagePrompt.trim(), style: imageStyle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Image generation failed');
      setGeneratedImages((prev) => [{ prompt: imagePrompt.trim(), url: data.imageUrl }, ...prev]);
      setImagePrompt('');
      pushToast(lang === 'ar' ? 'تم توليد العمل الفني بنجاح' : 'Artwork generated!', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Image generation failed', 'error');
    } finally {
      setGeneratingImg(false);
    }
  };

  const handleRunDriveAi = async (overrideAction?: DriveAction) => {
    const actionToRun = overrideAction || driveAction;
    if (!firebaseUser || selectedFileIds.length === 0) {
      pushToast(
        lang === 'ar' ? 'اختر ملفاً واحداً على الأقل من TIGER CLOUD' : 'Select at least one TIGER CLOUD file',
        'error'
      );
      return;
    }

    const selectedFiles = cloudFiles
      .filter((f) => selectedFileIds.includes(f.id))
      .slice(0, 8)
      .map((f) => ({
        storageKey: f.storageKey,
        name: f.name,
        mimeType: f.mimeType,
      }));

    setDriveLoading(true);
    setDriveTextResult('');
    setDriveQuiz(null);
    setDriveCards(null);
    setQuizAnswers({});
    setRevealedCards(new Set());

    try {
      const headers = await getAuthHeader();
      const res = await fetch('/api/drive-ai/analyze', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: selectedFiles,
          action: actionToRun,
          question: driveQuestion.trim() || undefined,
          language: lang,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'DRIVE AI failed');

      if (data.mode === 'quiz') {
        setDriveQuiz(data.data as DriveQuizData);
      } else if (data.mode === 'flashcards') {
        setDriveCards(data.data as DriveFlashcardsData);
      } else {
        setDriveTextResult(String(data.reply || ''));
      }

      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        aiRequestsCount: increment(1),
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'TIGER DRIVE AI error', 'error');
    } finally {
      setDriveLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-orange-500" />
            <span>{tab === 'drive' ? t.ai.driveTitle : t.ai.title}</span>
          </h1>
        </div>

        <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-xl">
          <button
            onClick={() => setTab('chat')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap ${
              tab === 'chat' ? 'bg-orange-500 text-white' : 'text-zinc-500'
            }`}
          >
            TIGER AI Chat
          </button>
          <button
            onClick={() => setTab('image')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap ${
              tab === 'image' ? 'bg-orange-500 text-white' : 'text-zinc-500'
            }`}
          >
            {t.ai.imageStudio}
          </button>
          <button
            onClick={() => setTab('drive')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap ${
              tab === 'drive' ? 'bg-orange-500 text-white' : 'text-zinc-500'
            }`}
          >
            TIGER DRIVE AI
          </button>
        </div>
      </div>

      {/* TAB 1: TIGER AI CHAT */}
      {tab === 'chat' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[70vh]">
          {/* Saved Conversations Sidebar */}
          <aside className="lg:col-span-3 bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 flex flex-col space-y-3">
            <button
              onClick={() => setActiveConvId(null)}
              className="w-full py-2.5 px-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> {t.ai.newChat}
            </button>
            <div className="flex-1 overflow-y-auto space-y-1">
              {conversations.map((c) => (
                <div
                  key={c.id}
                  className={`flex items-center justify-between gap-1 px-2.5 py-2 rounded-xl text-xs transition-colors ${
                    activeConvId === c.id
                      ? 'bg-orange-500/15 text-orange-500 font-semibold'
                      : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  <button
                    onClick={() => setActiveConvId(c.id)}
                    className="flex-1 text-start truncate cursor-pointer"
                  >
                    {c.title}
                  </button>
                  <button
                    onClick={async () => {
                      await deleteDoc(doc(db, 'aiConversations', c.id));
                      if (activeConvId === c.id) setActiveConvId(null);
                    }}
                    className="p-1 text-zinc-400 hover:text-red-500 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </aside>

          {/* Chat Thread */}
          <section className="lg:col-span-9 bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col h-[72vh]">
            {/* Task Mode Bar */}
            <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-1.5 overflow-x-auto">
              {AI_MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setTaskMode(m.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 cursor-pointer transition-colors ${
                    taskMode === m.id
                      ? 'bg-orange-500 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  {lang === 'ar' ? m.ar : m.en}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-3 text-zinc-500 px-6">
                  <Sparkles className="w-10 h-10 text-orange-500" />
                  <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    {lang === 'ar' ? 'كيف يمكنني مساعدتك اليوم؟' : 'How can TIGER AI help you today?'}
                  </h2>
                  <p className="text-xs max-w-md">
                    {lang === 'ar'
                      ? 'اكتب مقالات، ترجم نصوصاً، لخص دروساً، احصل على مساعدة برمجية، أو ولّد أفكاراً مبتكرة.'
                      : 'Write articles, translate seamlessly, summarize notes, debug code, or brainstorm ideas.'}
                  </p>
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed ${
                        m.role === 'user'
                          ? 'bg-orange-500 text-white'
                          : 'bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 prose prose-sm dark:prose-invert max-w-none'
                      }`}
                    >
                      {m.role === 'assistant' ? (
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      ) : (
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
              {sending && (
                <div className="text-xs text-orange-500 font-semibold animate-pulse">
                  {lang === 'ar' ? 'TIGER AI يفكر ويكتب الإجابة...' : 'TIGER AI is generating response...'}
                </div>
              )}
            </div>

            <form
              onSubmit={handleSendAi}
              className="p-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2"
            >
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t.ai.promptPlaceholder}
                className="flex-1 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500"
              />
              <button
                type="submit"
                disabled={sending || !prompt.trim()}
                className="px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </section>
        </div>
      )}

      {/* TAB 2: TIGER AI IMAGE STUDIO */}
      {tab === 'image' && (
        <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-5">
          <div className="space-y-1">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-orange-500" />
              <span>{t.ai.imageStudio}</span>
            </h2>
            <p className="text-xs text-zinc-500">
              {lang === 'ar'
                ? 'توليد رسومات وتصاميم فنية متجهة (SVG) عالية الدقة عبر خادم TIGER AI الآمن.'
                : 'Generate crisp bespoke vector artwork via the secure TIGER AI backend.'}
            </p>
          </div>

          <form onSubmit={handleGenerateImage} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              required
              placeholder={
                lang === 'ar'
                  ? 'صف الصورة أو التصميم المطلوب (مثال: شعار نمر هندسي على جبل عند الغروب)...'
                  : 'Describe your artwork (e.g., minimalist desert architecture at golden hour)...'
              }
              className="flex-1 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500"
            />
            <select
              value={imageStyle}
              onChange={(e) => setImageStyle(e.target.value as typeof imageStyle)}
              className="rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 py-2.5 text-xs"
            >
              <option value="editorial">Editorial</option>
              <option value="minimal">Minimal</option>
              <option value="architecture">Architecture</option>
              <option value="abstract">Abstract</option>
              <option value="logo">Logo Emblem</option>
            </select>
            <button
              type="submit"
              disabled={generatingImg}
              className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-bold cursor-pointer whitespace-nowrap"
            >
              {generatingImg
                ? lang === 'ar'
                  ? 'جارٍ التوليد...'
                  : 'Generating...'
                : lang === 'ar'
                ? 'إنشاء التصميم'
                : 'Generate Art'}
            </button>
          </form>

          {generatedImages.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {generatedImages.map((img, i) => (
                <div
                  key={i}
                  className="rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-950 flex flex-col"
                >
                  <img src={img.url} alt={img.prompt} className="w-full h-72 object-contain bg-zinc-950" />
                  <div className="p-3 bg-white dark:bg-[#121216] flex items-center justify-between gap-2">
                    <span className="text-xs truncate">{img.prompt}</span>
                    <a
                      href={img.url}
                      download={`tiger-ai-${i + 1}.svg`}
                      className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-bold inline-flex items-center gap-1 shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" /> SVG
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: TIGER DRIVE AI */}
      {tab === 'drive' && (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-orange-500/10 border border-orange-500/25 flex items-center gap-2.5 text-xs text-orange-600 dark:text-orange-300">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>{t.ai.permissionBanner}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Cloud File Picker */}
            <aside className="lg:col-span-4 bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-sm">{t.ai.selectCloudFiles}</h2>
                <span className="text-xs font-mono text-orange-500 tabular-nums">
                  {selectedFileIds.length}
                </span>
              </div>

              {/* Quick select entire folder */}
              {cloudFolders.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] text-zinc-500 font-semibold">
                    {lang === 'ar' ? 'تحديد مجلد كامل:' : 'Select Entire Folder:'}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cloudFolders.map((folder) => {
                      const folderFileIds = cloudFiles
                        .filter((f) => f.folderId === folder.id)
                        .map((f) => f.id);
                      return (
                        <button
                          key={folder.id}
                          onClick={() => setSelectedFileIds(folderFileIds)}
                          className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-orange-500 text-xs inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Folder className="w-3.5 h-3.5 text-orange-500" />
                          <span>{folder.name}</span>
                          <span className="text-[10px] text-zinc-500">({folderFileIds.length})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
                {cloudFiles.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-6 text-center">
                    {lang === 'ar'
                      ? 'ارفع ملفات PDF أو Word أو نص في قسم TIGER CLOUD أولاً لتظهر هنا.'
                      : 'Upload PDF, Word (.docx), or text files in TIGER CLOUD first.'}
                  </p>
                ) : (
                  cloudFiles.map((f) => {
                    const checked = selectedFileIds.includes(f.id);
                    return (
                      <button
                        key={f.id}
                        onClick={() =>
                          setSelectedFileIds((prev) =>
                            prev.includes(f.id) ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                          )
                        }
                        className={`w-full p-2.5 rounded-xl border text-start flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          checked
                            ? 'border-orange-500 bg-orange-500/10'
                            : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-orange-500 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold truncate">{f.name}</div>
                            <div className="text-[10px] text-zinc-500 font-mono">
                              {formatBytes(f.sizeBytes)}
                            </div>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-orange-500 shrink-0">
                          {checked ? '✓' : ''}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            {/* DRIVE AI Workbench */}
            <section className="lg:col-span-8 bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-5">
              {/* Quick Actions */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(
                  [
                    ['summarize', BookOpen, lang === 'ar' ? 'تلخيص المستند' : 'Summarize PDF/Doc'],
                    ['analyze', Sparkles, lang === 'ar' ? 'تحليل عميق' : 'Deep Analysis'],
                    ['extract', FileText, lang === 'ar' ? 'استخراج المعلومات' : 'Extract Info'],
                    ['folder_summary', Folder, lang === 'ar' ? 'تلخيص المجلد' : 'Folder Summary'],
                    ['quiz', HelpCircle, lang === 'ar' ? 'إنشاء اختبار تفاعلي' : 'Generate Quiz'],
                    ['flashcards', BookOpen, lang === 'ar' ? 'أسئلة وأجوبة' : 'Q&A Study Cards'],
                    ['outline', ListTree, lang === 'ar' ? 'ملخص منظم' : 'Structured Outline'],
                    ['qa', Send, lang === 'ar' ? 'سؤال حول المستند' : 'Ask Document'],
                    ['search', Search, lang === 'ar' ? 'بحث ذكي بالملفات' : 'Smart Search'],
                  ] as const
                ).map(([act, Icon, lbl]) => (
                  <button
                    key={act}
                    onClick={() => {
                      setDriveAction(act);
                      if (act !== 'qa' && act !== 'search') {
                        handleRunDriveAi(act);
                      }
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
                      driveAction === act
                        ? 'border-orange-500 bg-orange-500/10 text-orange-500'
                        : 'border-zinc-200 dark:border-zinc-800 hover:border-orange-500/50'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{lbl}</span>
                  </button>
                ))}
              </div>

              {/* Question / Smart Search Input */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={driveQuestion}
                  onChange={(e) => setDriveQuestion(e.target.value)}
                  placeholder={
                    lang === 'ar'
                      ? 'اطرح سؤالاً محدداً أو ابحث داخل ملفاتك المحددة...'
                      : 'Ask a specific question or semantic search query across selected files...'
                  }
                  className="flex-1 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3.5 py-2.5 text-sm focus:outline-none focus:border-orange-500"
                />
                <button
                  onClick={() => handleRunDriveAi()}
                  disabled={driveLoading || selectedFileIds.length === 0}
                  className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                >
                  {driveLoading ? t.common.loading : lang === 'ar' ? 'تحليل الآن' : 'Run DRIVE AI'}
                </button>
              </div>

              {/* Results Output */}
              {driveLoading && (
                <div className="py-12 text-center text-sm text-orange-500 font-semibold animate-pulse">
                  {lang === 'ar'
                    ? 'جارٍ قراءة الملفات بعد التحقق من صلاحياتك وتحليلها بـ Gemini...'
                    : 'Verifying ownership and analyzing your Cloud documents with Gemini...'}
                </div>
              )}

              {driveTextResult && (
                <div className="p-5 rounded-xl bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{driveTextResult}</ReactMarkdown>
                </div>
              )}

              {/* Interactive Quiz Renderer */}
              {driveQuiz && driveQuiz.questions && (
                <div className="space-y-4">
                  <h3 className="font-bold text-base">{driveQuiz.title}</h3>
                  {driveQuiz.questions.map((q, qIdx) => {
                    const chosen = quizAnswers[qIdx];
                    const answered = chosen !== undefined;
                    return (
                      <div
                        key={qIdx}
                        className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 space-y-2.5"
                      >
                        <div className="text-sm font-bold">
                          {qIdx + 1}. {q.question}
                        </div>
                        <div className="space-y-1.5">
                          {q.options.map((opt, oIdx) => {
                            const isCorrect = oIdx === q.correctIndex;
                            const isSelected = chosen === oIdx;
                            return (
                              <button
                                key={oIdx}
                                onClick={() => setQuizAnswers((prev) => ({ ...prev, [qIdx]: oIdx }))}
                                className={`w-full p-2.5 rounded-xl border text-start text-xs font-medium flex items-center justify-between cursor-pointer ${
                                  answered
                                    ? isCorrect
                                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                                      : isSelected
                                      ? 'border-red-500 bg-red-500/15 text-red-500'
                                      : 'border-zinc-200 dark:border-zinc-800 opacity-60'
                                    : 'border-zinc-200 dark:border-zinc-800 hover:border-orange-500'
                                }`}
                              >
                                <span>{opt}</span>
                                {answered && isCorrect && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                                {answered && isSelected && !isCorrect && <XCircle className="w-4 h-4 shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                        {answered && q.explanation && (
                          <p className="text-xs text-zinc-500 pt-1">{q.explanation}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Q&A Study Flashcards Renderer */}
              {driveCards && driveCards.cards && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {driveCards.cards.map((card, idx) => {
                    const open = revealedCards.has(idx);
                    return (
                      <button
                        key={idx}
                        onClick={() =>
                          setRevealedCards((prev) => {
                            const next = new Set(prev);
                            if (next.has(idx)) next.delete(idx);
                            else next.add(idx);
                            return next;
                          })
                        }
                        className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-orange-500 text-start space-y-2 cursor-pointer"
                      >
                        <div className="text-xs font-bold text-orange-500">Q{idx + 1}</div>
                        <div className="text-sm font-semibold">{card.question}</div>
                        {open ? (
                          <div className="text-xs text-zinc-600 dark:text-zinc-300 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                            {card.answer}
                          </div>
                        ) : (
                          <div className="text-[11px] text-zinc-500">
                            {lang === 'ar' ? 'اضغط لعرض الإجابة' : 'Click to reveal answer'}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
