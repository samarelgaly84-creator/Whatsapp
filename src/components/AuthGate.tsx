import React from 'react';
import {
  MessageSquare,
  Cloud,
  Sparkles,
  Video,
  Globe,
  Sun,
  Moon,
  ShieldCheck,
  Radio,
  Users,
} from 'lucide-react';
import { useTiger } from '../context/TigerContext';
import { TIGER_ASSETS } from '../lib/assets';

export function AuthGate() {
  const { signInWithGoogle, lang, setLang, theme, toggleTheme, t } = useTiger();

  const capabilities = [
    {
      icon: Users,
      title: lang === 'ar' ? 'TIGER SOCIAL & STORIES' : 'TIGER SOCIAL & STORIES',
      desc:
        lang === 'ar'
          ? 'منشورات متعددة الوسائط، استطلاعات، ملفات PDF، تفاعلات غنية، وقصص تختفي خلال 24 ساعة.'
          : 'Multi-media posts, live polls, PDF sharing, rich reactions, and 24-hour ephemeral stories.',
    },
    {
      icon: MessageSquare,
      title: lang === 'ar' ? 'TIGER CHAT & WEBRTC' : 'TIGER CHAT & WEBRTC',
      desc:
        lang === 'ar'
          ? 'محادثات فورية عبر WebSockets، رسائل صوتية، مكالمات فيديو وصوت، وتشفير Web Crypto اختياري.'
          : 'Instant WebSocket messaging, voice notes, WebRTC video/voice calls, and Web Crypto encryption.',
    },
    {
      icon: Cloud,
      title: lang === 'ar' ? 'TIGER CLOUD & DRIVE AI' : 'TIGER CLOUD & DRIVE AI',
      desc:
        lang === 'ar'
          ? 'تخزين سحابي حقيقي للملفات وPDF وWord مع تلخيص ذكي واختبارات تفاعلية محمية بصلاحياتك.'
          : 'Real server cloud storage for PDFs, Word docs, and media paired with permission-verified AI analysis.',
    },
    {
      icon: Video,
      title: lang === 'ar' ? 'TIGER REELS & LIVE' : 'TIGER REELS & LIVE',
      desc:
        lang === 'ar'
          ? 'فيديوهات عمودية سريعة وبث مباشر بالكاميرا مع تعليقات فورية وحفظ تلقائي للبث.'
          : 'Vertical short-form reels and live WebRTC broadcasts with real-time audience chat and recording.',
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#09090B] text-zinc-900 dark:text-zinc-100 flex flex-col">
      {/* Top 3-zone header */}
      <header className="w-full border-b border-zinc-200 dark:border-zinc-800/80 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 shrink-0">
            <img
              src={TIGER_ASSETS.logo}
              alt="TIGER Emblem"
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-xl object-cover border border-orange-500/40"
            />
            <span className="font-display text-xl font-extrabold tracking-tight whitespace-nowrap">
              TIGER
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-orange-500" />
              {lang === 'ar' ? 'English' : 'العربية'}
            </button>
            <button
              onClick={toggleTheme}
              aria-label="Toggle Theme"
              className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-orange-400" />
              ) : (
                <Moon className="w-4 h-4 text-zinc-700" />
              )}
            </button>
            <button
              onClick={signInWithGoogle}
              className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer"
            >
              {t.signInGoogle}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Split */}
      <main className="flex-1 flex items-center px-6 py-12">
        <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-7 flex flex-col justify-center space-y-7">
            <div className="space-y-4">
              <p className="text-xs font-semibold tracking-wider text-orange-500">
                TIGER PLATFORM · CONNECT · SHARE · CREATE · STORE · DISCOVER
              </p>
              <h1 className="font-display text-4xl sm:text-5xl font-extrabold leading-tight tracking-tight">
                {lang === 'ar'
                  ? 'منصتك المتكاملة للتواصل، المحادثات، التخزين السحابي، والذكاء الاصطناعي.'
                  : 'One unified platform for social connection, real-time chat, cloud storage, and AI.'}
              </h1>
              <p className="text-base text-zinc-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
                {lang === 'ar'
                  ? 'اجمع بين قوة الشبكة الاجتماعية، المحادثات الفورية والمكالمات، الفيديوهات القصيرة، البث المباشر، التخزين السحابي الحقيقي، ومساعد TIGER AI وDRIVE AI داخل تجربة عربية وإنجليزية فائقة السرعة.'
                  : 'Experience social feeds, ephemeral stories, vertical reels, live WebRTC broadcasting, instant encrypted messaging, real server cloud storage, and Gemini-powered document intelligence under one obsidian-and-orange roof.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={signInWithGoogle}
                className="px-6 py-3.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm inline-flex items-center gap-3 transition-colors cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                {t.signInGoogle}
              </button>
              <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <ShieldCheck className="w-4 h-4 text-orange-500 shrink-0" />
                <span>
                  {lang === 'ar'
                    ? 'مصادقة آمنة · قاعدة بيانات حقيقية · تخزين سحابي محمي'
                    : 'Verified Auth · Real Database · Protected Cloud Storage'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
              {capabilities.map((cap) => (
                <div
                  key={cap.title}
                  className="p-4 rounded-2xl bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 space-y-1.5"
                >
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <cap.icon className="w-4 h-4 text-orange-500 shrink-0" />
                    <span>{cap.title}</span>
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    {cap.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col">
            <div className="relative flex-1 min-h-[380px] rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-[#09090B]">
              <img
                src={TIGER_ASSETS.coverStudio}
                alt="TIGER Architectural Studio"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col justify-between p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10">
                    <img
                      src={TIGER_ASSETS.logo}
                      alt="TIGER"
                      referrerPolicy="no-referrer"
                      className="w-6 h-6 rounded-md object-cover"
                    />
                    <span className="text-xs font-bold text-white tracking-wide">TIGER OS</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-orange-300 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-orange-500/30">
                    <Radio className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'بث ومحادثات فورية' : 'Real-Time Ready'}</span>
                  </div>
                </div>

                <div className="space-y-2 text-white">
                  <div className="text-xs text-orange-400 font-semibold">
                    {lang === 'ar' ? 'هوية TIGER الاحترافية' : 'Signature TIGER Identity'}
                  </div>
                  <h2 className="font-display text-2xl font-bold leading-snug">
                    {t.tagline}
                  </h2>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {lang === 'ar'
                      ? 'دعم كامل للغتين العربية والإنجليزية، الوضع الليلي والنهاري، وتحليل فوري لملفاتك السحابية بالذكاء الاصطناعي.'
                      : 'Full Arabic RTL & English LTR support, dual obsidian/daylight themes, and direct AI analysis over your cloud drive.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
