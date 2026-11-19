# TIGER — Connect. Share. Create. Store. Discover.

Unified full-stack platform combining Social Feed, 24h Stories, Vertical Reels, Live WebRTC Broadcasting, Real-Time Chat (WebSockets + WebRTC Calls + Optional Web Crypto E2EE), Real Cloud File Storage, **TIGER AI**, **TIGER DRIVE AI** (PDF & Word document intelligence), Groups, Pages, Friends, Subscriptions, and Server-Protected Admin Console.

## Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS v4 (Dual Dark/Light theme, Bilingual Arabic RTL & English LTR)
- **Backend**: Node.js + Express (`server.ts`), WebSockets (`ws`) for real-time messaging, presence, live room events, and WebRTC signaling
- **Database & Auth**: Firebase Authentication (Google Sign-In) + Cloud Firestore with hardened security rules (`firestore.rules`)
- **Cloud File Storage**: Authenticated server-side disk storage (`./uploads/<uid>/`) with MIME validation, share-token access control, and inline streaming preview (no `localStorage` file hacks)
- **AI Engine**: Server-side `@google/genai` (`gemini-4-hydrogen`) powering TIGER AI and TIGER DRIVE AI (multimodal PDF analysis + `mammoth` `.docx` extraction + quiz/Q&A/outline generation)
- **Portable SQL Schema**: Full 33-table PostgreSQL / Supabase DDL included in `docs/postgresql-schema.sql`

## Running Locally
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in `GEMINI_API_KEY` (and optional `STRIPE_SECRET_KEY` for live payment checkout).
3. Start development server on port 3000:
   ```bash
   npm run dev
   ```
4. Build & run in production:
   ```bash
   npm run build
   npm start
   ```

## Security & Rules Verification
- Validate Firestore rules with ESLint:
  ```bash
  npm run lint:rules
  ```
- Review `security_spec.md` and `firestore.rules` before broad public deployment.

## Deploying Frontend / Full-Stack
- **Cloud Run / Node Hosting (Recommended for WebSockets + File Storage)**: Deploy directly with `npm run build` and `npm start` on port `3000`.
- **Vercel (Frontend) + Node Backend**: Deploy the Vite frontend build (`dist/`) to Vercel and host `server.ts` on a persistent Node service (Cloud Run / Fly.io / Railway) pointing API & WebSocket proxy traffic to it.
