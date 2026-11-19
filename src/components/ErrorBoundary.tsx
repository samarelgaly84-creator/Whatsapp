import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { TIGER_ASSETS } from '../lib/assets';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message || 'An unexpected runtime error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('TIGER Global ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      let displayMsg = this.state.errorMessage;
      try {
        const parsed = JSON.parse(this.state.errorMessage);
        if (parsed?.error) {
          displayMsg = `${parsed.error} (${parsed.operationType || 'op'} · ${parsed.path || ''})`;
        }
      } catch {
        // standard message
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-[#09090B] text-zinc-900 dark:text-zinc-100 p-6">
          <div className="max-w-lg w-full bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center space-y-5">
            <div className="flex items-center justify-center gap-3">
              <img
                src={TIGER_ASSETS.logo}
                alt="TIGER Logo"
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-xl object-cover"
              />
              <span className="font-display text-xl font-extrabold tracking-tight">TIGER</span>
            </div>
            <div className="w-12 h-12 mx-auto rounded-full bg-orange-500/10 text-orange-500 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-bold">حدث خطأ غير متوقع / Unexpected Error</h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 break-words">{displayMsg}</p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => this.setState({ hasError: false, errorMessage: '' })}
                className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors inline-flex items-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                إعادة المحاولة / Retry
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm font-medium transition-colors cursor-pointer"
              >
                تحديث الصفحة / Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
