import React, { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Flag, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useTiger } from '../context/TigerContext';

export function ReportModal() {
  const { reportTarget, closeReportModal, firebaseUser, lang, pushToast } = useTiger();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!reportTarget || !firebaseUser) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'reports'), {
        reporterUid: firebaseUser.uid,
        targetType: reportTarget.targetType,
        targetId: reportTarget.targetId,
        reason: reason.trim().slice(0, 480),
        status: 'open',
        createdAt: serverTimestamp(),
      });
      pushToast(
        lang === 'ar' ? 'تم إرسال البلاغ لفريق الإدارة بنجاح' : 'Report submitted to moderation team',
        'success'
      );
      setReason('');
      closeReportModal();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'reports');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold">
            <Flag className="w-4 h-4 text-orange-500" />
            <span>{lang === 'ar' ? 'الإبلاغ عن مخالفة' : 'Report Content'}</span>
          </div>
          <button
            onClick={closeReportModal}
            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {reportTarget.label || `${reportTarget.targetType} · ${reportTarget.targetId}`}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            required
            minLength={3}
            maxLength={480}
            placeholder={
              lang === 'ar'
                ? 'اشرح سبب الإبلاغ بوضوح ليراجعه المشرفون...'
                : 'Describe why this violates TIGER guidelines...'
            }
            className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3 text-sm focus:outline-none focus:border-orange-500"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={closeReportModal}
              className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-medium cursor-pointer"
            >
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={submitting || reason.trim().length < 3}
              className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold cursor-pointer"
            >
              {submitting
                ? lang === 'ar'
                  ? 'جارٍ الإرسال...'
                  : 'Submitting...'
                : lang === 'ar'
                ? 'إرسال البلاغ'
                : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
