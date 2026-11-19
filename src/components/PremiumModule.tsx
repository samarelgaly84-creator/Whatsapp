import React, { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  Crown,
  Check,
  ShieldCheck,
  HardDrive,
  Sparkles,
  Receipt,
  AlertTriangle,
  XCircle,
  ExternalLink,
} from 'lucide-react';
import { db, getAuthHeader, handleFirestoreError, OperationType } from '../lib/firebase';
import { useTiger } from '../context/TigerContext';
import { PaymentRecordItem } from '../types/tiger';
import { formatBytes } from '../lib/upload';

interface BillingPlanInfo {
  id: 'free' | 'plus' | 'pro';
  name: string;
  priceMonthlyUsd: number;
  storageQuotaBytes: number;
  aiMonthlyLimit: number;
}

export function PremiumModule() {
  const { firebaseUser, account, lang, t, pushToast } = useTiger();
  const [stripeConfigured, setStripeConfigured] = useState(false);
  const [plans, setPlans] = useState<BillingPlanInfo[]>([
    { id: 'free', name: 'TIGER FREE', priceMonthlyUsd: 0, storageQuotaBytes: 512 * 1024 * 1024, aiMonthlyLimit: 50 },
    { id: 'plus', name: 'TIGER PLUS', priceMonthlyUsd: 9, storageQuotaBytes: 50 * 1024 * 1024 * 1024, aiMonthlyLimit: 500 },
    { id: 'pro', name: 'TIGER PRO', priceMonthlyUsd: 24, storageQuotaBytes: 250 * 1024 * 1024 * 1024, aiMonthlyLimit: 2500 },
  ]);
  const [invoices, setInvoices] = useState<PaymentRecordItem[]>([]);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [gatewayNotice, setGatewayNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;

    (async () => {
      try {
        const headers = await getAuthHeader();
        const res = await fetch('/api/billing/status', { headers });
        if (res.ok) {
          const data = await res.json();
          setStripeConfigured(Boolean(data.stripeConfigured));
          if (Array.isArray(data.plans)) setPlans(data.plans);
        }
      } catch {
        // fallback defaults already set
      }
    })();

    const unsub = onSnapshot(
      query(collection(db, 'payments'), where('userId', '==', firebaseUser.uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<PaymentRecordItem, 'id'>) }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setInvoices(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'payments')
    );

    return () => unsub();
  }, [firebaseUser]);

  if (!firebaseUser || !account) return null;

  const handleRequestUpgrade = async (planId: 'plus' | 'pro') => {
    setBusyPlan(planId);
    setGatewayNotice(null);
    try {
      const headers = await getAuthHeader();
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Checkout failed');
      }

      const amountCents = planId === 'plus' ? 900 : 2400;

      // Always record transparent pending_verification invoice — NEVER falsify active paid state!
      await addDoc(collection(db, 'payments'), {
        userId: firebaseUser.uid,
        plan: planId,
        amountCents,
        currency: 'USD',
        status: 'pending_verification',
        note: data.configured
          ? `Stripe Checkout Session ${data.sessionId || ''} initiated`
          : 'Awaiting configured Stripe gateway or verified admin billing confirmation',
        createdAt: serverTimestamp(),
      });

      if (data.configured && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      setGatewayNotice(
        lang === 'ar'
          ? 'بوابة الدفع الفعلية (STRIPE_SECRET_KEY) غير مهيأة بعد على الخادم. تم تسجيل طلبك بحالة "بانتظار التحقق" وتظل خطتك الحالية كما هي حتى يتم التحقق الفعلي من الدفع.'
          : data.message ||
              'Live payment gateway is not configured yet. Your request is logged as pending_verification and your active plan remains unchanged until verified payment completes.'
      );
      pushToast(
        lang === 'ar'
          ? 'تم تسجيل طلب الاشتراك كـ "بانتظار التحقق"'
          : 'Upgrade request logged as pending verification',
        'info'
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Checkout error', 'error');
    } finally {
      setBusyPlan(null);
    }
  };

  const handleCancelInvoice = async (invoiceId: string) => {
    try {
      await updateDoc(doc(db, 'payments', invoiceId), { status: 'cancelled' });
      pushToast(lang === 'ar' ? 'تم إلغاء الطلب المعلق' : 'Pending request cancelled', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `payments/${invoiceId}`);
    }
  };

  const planPerks: Record<'free' | 'plus' | 'pro', string[]> = {
    free:
      lang === 'ar'
        ? ['512 MB تخزين سحابي حقيقي', '50 طلب شهرياً لـ TIGER AI و DRIVE AI', 'جميع ميزات التواصل والمحادثات والبث المباشر']
        : ['512 MB real TIGER Cloud storage', '50 monthly TIGER AI & DRIVE AI requests', 'Full Social, Chat, Reels & Live access'],
    plus:
      lang === 'ar'
        ? ['50 GB مساحة TIGER CLOUD خاصة', '500 طلب شهرياً لـ TIGER AI و DRIVE AI', 'تحليل مجلدات كاملة واستوديو صور متقدم', 'أولوية دعم فني وتحقق رسمي']
        : ['50 GB private TIGER Cloud storage', '500 monthly TIGER AI & DRIVE AI requests', 'Multi-file DRIVE AI synthesis & Image Studio', 'Priority support & verified billing'],
    pro:
      lang === 'ar'
        ? ['250 GB مساحة TIGER CLOUD فائقة', '2,500 طلب شهرياً لـ TIGER AI و DRIVE AI', 'حفظ تسجيلات البث المباشر بجودة عالية', 'أدوات أعمال متقدمة وتحليلات شاملة']
        : ['250 GB enterprise TIGER Cloud storage', '2,500 monthly TIGER AI & DRIVE AI requests', 'High-bitrate Live recording cloud archives', 'Advanced creator & business analytics'],
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight flex items-center gap-2.5">
          <Crown className="w-6 h-6 text-orange-500" />
          {t.premium.title}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-2xl">{t.premium.subtitle}</p>
      </div>

      {/* Current Account Entitlement Strip */}
      <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">{t.premium.currentPlan}</div>
            <div className="font-display text-xl font-extrabold uppercase">TIGER {account.plan}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-6 text-xs text-zinc-600 dark:text-zinc-300 tabular-nums">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-orange-500" />
            <span>
              {formatBytes(account.storageUsedBytes || 0)} / {formatBytes(account.storageQuotaBytes || 536870912)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-orange-500" />
            <span>
              {account.aiRequestsCount || 0} {lang === 'ar' ? 'طلب AI مستخدم' : 'AI calls used'}
            </span>
          </div>
        </div>
      </div>

      {gatewayNotice && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <p>{gatewayNotice}</p>
        </div>
      )}

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {plans.map((plan) => {
          const isCurrent = account.plan === plan.id;
          const isPro = plan.id === 'pro';
          return (
            <div
              key={plan.id}
              className={`rounded-2xl p-6 flex flex-col justify-between gap-6 border ${
                isPro
                  ? 'bg-zinc-950 text-white border-orange-500/60'
                  : 'bg-white dark:bg-[#121216] border-zinc-200 dark:border-zinc-800'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-display text-lg font-extrabold tracking-tight">{plan.name}</span>
                  {isCurrent && (
                    <span className="text-[11px] font-bold uppercase text-orange-500">
                      {lang === 'ar' ? 'نشطة' : 'Active'}
                    </span>
                  )}
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="font-mono text-4xl font-extrabold tabular-nums">${plan.priceMonthlyUsd}</span>
                  <span className={`text-xs ${isPro ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    / {lang === 'ar' ? 'شهرياً' : 'month'}
                  </span>
                </div>

                <div className={`text-xs tabular-nums ${isPro ? 'text-zinc-300' : 'text-zinc-500 dark:text-zinc-400'}`}>
                  {formatBytes(plan.storageQuotaBytes)} · {plan.aiMonthlyLimit}{' '}
                  {lang === 'ar' ? 'طلب ذكاء اصطناعي' : 'AI requests'}
                </div>

                <ul className="space-y-2.5 pt-2">
                  {planPerks[plan.id].map((perk) => (
                    <li key={perk} className="flex items-start gap-2 text-xs">
                      <Check className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                      <span className={isPro ? 'text-zinc-200' : 'text-zinc-700 dark:text-zinc-300'}>{perk}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {plan.id === 'free' ? (
                <button
                  disabled
                  className="w-full py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 text-xs font-semibold"
                >
                  {isCurrent ? t.premium.currentPlan : lang === 'ar' ? 'الخطة الأساسية' : 'Base Tier'}
                </button>
              ) : (
                <button
                  disabled={isCurrent || busyPlan === plan.id}
                  onClick={() => handleRequestUpgrade(plan.id as 'plus' | 'pro')}
                  className={`w-full py-2.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 ${
                    isPro
                      ? 'bg-orange-500 hover:bg-orange-600 text-white'
                      : 'bg-zinc-900 dark:bg-orange-500 hover:bg-orange-600 text-white'
                  }`}
                >
                  {busyPlan === plan.id
                    ? '...'
                    : isCurrent
                    ? t.premium.currentPlan
                    : stripeConfigured
                    ? `${t.premium.upgrade} (Stripe)`
                    : lang === 'ar'
                    ? 'طلب ترقية (بانتظار الدفع)'
                    : 'Request Upgrade (Verification)'}
                  {stripeConfigured && !isCurrent && <ExternalLink className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Billing & Invoice History */}
      <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-base flex items-center gap-2">
            <Receipt className="w-4 h-4 text-orange-500" />
            {t.premium.invoices}
          </h2>
          <span className="text-xs text-zinc-500 tabular-nums">{invoices.length}</span>
        </div>

        {invoices.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {lang === 'ar' ? 'لا توجد فواتير أو طلبات ترقية مسجلة بعد.' : 'No billing records or upgrade requests yet.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500">
                <tr>
                  <th className="py-2.5 pe-4 text-start">{lang === 'ar' ? 'الخطة' : 'Plan'}</th>
                  <th className="py-2.5 pe-4 text-start">{lang === 'ar' ? 'المبلغ' : 'Amount'}</th>
                  <th className="py-2.5 pe-4 text-start">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="py-2.5 pe-4 text-start">{lang === 'ar' ? 'ملاحظة' : 'Note'}</th>
                  <th className="py-2.5 text-end">{lang === 'ar' ? 'إجراء' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-3 pe-4 font-bold uppercase">TIGER {inv.plan}</td>
                    <td className="py-3 pe-4 font-mono tabular-nums">
                      ${(inv.amountCents / 100).toFixed(2)} {inv.currency}
                    </td>
                    <td className="py-3 pe-4">
                      <span
                        className={`font-semibold ${
                          inv.status === 'verified'
                            ? 'text-emerald-500'
                            : inv.status === 'cancelled'
                            ? 'text-zinc-400'
                            : 'text-amber-500'
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3 pe-4 text-zinc-500 max-w-xs truncate">{inv.note || '—'}</td>
                    <td className="py-3 text-end">
                      {inv.status === 'pending_verification' && (
                        <button
                          onClick={() => handleCancelInvoice(inv.id)}
                          className="text-red-500 hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
