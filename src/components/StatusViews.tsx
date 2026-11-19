import React, { useState } from 'react';
import { AlertCircle, Compass, RotateCcw } from 'lucide-react';
import { TIGER_ASSETS } from '../lib/assets';

export function LoadingScreen({ label = 'TIGER...' }: { label?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-[#09090B] text-zinc-900 dark:text-zinc-100 p-6">
      <div className="relative mb-5">
        <img
          src={TIGER_ASSETS.logo}
          alt="TIGER"
          referrerPolicy="no-referrer"
          className="w-16 h-16 rounded-2xl object-cover border border-orange-500/40"
        />
      </div>
      <div className="font-display text-2xl font-extrabold tracking-tight mb-2">TIGER</div>
      <div className="w-40 h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div className="w-1/2 h-full bg-orange-500 rounded-full animate-pulse" />
      </div>
      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
    </div>
  );
}

export function ErrorView({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center max-w-lg mx-auto my-12 space-y-4">
      <div className="w-11 h-11 mx-auto rounded-full bg-red-500/10 text-red-500 flex items-center justify-center">
        <AlertCircle className="w-5 h-5" />
      </div>
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          Retry / إعادة المحاولة
        </button>
      )}
    </div>
  );
}

export function NotFoundView({ onBack, lang }: { onBack: () => void; lang: 'ar' | 'en' }) {
  return (
    <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-10 text-center max-w-lg mx-auto my-12 space-y-4">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-orange-500/10 text-orange-500 flex items-center justify-center">
        <Compass className="w-7 h-7" />
      </div>
      <div className="font-mono text-4xl font-bold text-orange-500 tabular-nums">404</div>
      <h2 className="text-xl font-bold">
        {lang === 'ar' ? 'الصفحة غير موجودة' : 'Page Not Found'}
      </h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {lang === 'ar'
          ? 'لم نتمكن من العثور على الصفحة أو المحتوى المطلوب داخل منصة TIGER.'
          : 'The requested section or resource could not be found on TIGER.'}
      </p>
      <button
        onClick={onBack}
        className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors cursor-pointer"
      >
        {lang === 'ar' ? 'العودة للرئيسية' : 'Return Home'}
      </button>
    </div>
  );
}

export function TigerAvatar({
  src,
  name,
  size = 'md',
  online,
}: {
  src?: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  online?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const dims = {
    xs: 'w-7 h-7 text-xs',
    sm: 'w-9 h-9 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-lg',
    xl: 'w-24 h-24 text-2xl',
  }[size];

  const initials = (name || 'T').trim().slice(0, 2).toUpperCase();

  return (
    <div className={`relative shrink-0 ${dims}`}>
      {src && !failed ? (
        <img
          src={src}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className={`${dims} rounded-full object-cover border border-zinc-200 dark:border-zinc-700`}
        />
      ) : (
        <div
          className={`${dims} rounded-full bg-zinc-900 dark:bg-zinc-800 text-orange-400 font-bold flex items-center justify-center border border-zinc-700`}
        >
          {initials}
        </div>
      )}
      {online && (
        <span
          title="Online"
          className="absolute bottom-0 end-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#121216]"
        />
      )}
    </div>
  );
}
