import React, { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  ShieldAlert,
  ShieldCheck,
  Users,
  FileText,
  Flag,
  HardDrive,
  Activity,
  Trash2,
  Ban,
  CheckCircle2,
  Receipt,
  ClipboardList,
  Users2,
} from 'lucide-react';
import { db, getAuthHeader, handleFirestoreError, OperationType } from '../lib/firebase';
import { useTiger } from '../context/TigerContext';
import {
  AdminLogItem,
  GroupItem,
  PageItem,
  PaymentRecordItem,
  PostItem,
  ReportItem,
  UserAccount,
} from '../types/tiger';
import { formatBytes, formatTimeAgo } from '../lib/upload';

interface ServerStats {
  uptimeSeconds: number;
  onlineSockets: number;
  privateCloudFiles: number;
  privateCloudBytes: number;
  publicMediaFiles: number;
  publicMediaBytes: number;
}

export function AdminModule() {
  const { firebaseUser, profilesMap, lang, pushToast } = useTiger();

  const [verifyState, setVerifyState] = useState<'loading' | 'authorized' | 'denied'>('loading');
  const [denyReason, setDenyReason] = useState('');
  const [serverStats, setServerStats] = useState<ServerStats | null>(null);

  const [tab, setTab] = useState<'overview' | 'users' | 'posts' | 'reports' | 'payments' | 'communities' | 'logs'>(
    'overview'
  );

  const [users, setUsers] = useState<UserAccount[]>([]);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [payments, setPayments] = useState<PaymentRecordItem[]>([]);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [logs, setLogs] = useState<AdminLogItem[]>([]);

  // Strict server-side RBAC check via /api/admin/verify
  useEffect(() => {
    if (!firebaseUser) return;
    let cancelled = false;
    (async () => {
      try {
        const headers = await getAuthHeader();
        const res = await fetch('/api/admin/verify', { headers });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.authorized) {
          setVerifyState('denied');
          setDenyReason(data.error || '403 Forbidden: Admin privileges required.');
          return;
        }
        setServerStats(data.serverStats || null);
        setVerifyState('authorized');
      } catch (err) {
        if (!cancelled) {
          setVerifyState('denied');
          setDenyReason(err instanceof Error ? err.message : 'Verification failed');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firebaseUser]);

  // Real-time admin listeners ONLY after server-verified authorization
  useEffect(() => {
    if (verifyState !== 'authorized') return;

    const u1 = onSnapshot(
      collection(db, 'users'),
      (snap) => setUsers(snap.docs.map((d) => d.data() as UserAccount)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'users(admin)')
    );
    const u2 = onSnapshot(
      collection(db, 'posts'),
      (snap) =>
        setPosts(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<PostItem, 'id'>) }))
            .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
        ),
      (err) => handleFirestoreError(err, OperationType.LIST, 'posts(admin)')
    );
    const u3 = onSnapshot(
      collection(db, 'reports'),
      (snap) =>
        setReports(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<ReportItem, 'id'>) }))
            .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
        ),
      (err) => handleFirestoreError(err, OperationType.LIST, 'reports(admin)')
    );
    const u4 = onSnapshot(
      collection(db, 'payments'),
      (snap) =>
        setPayments(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<PaymentRecordItem, 'id'>) }))
            .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
        ),
      (err) => handleFirestoreError(err, OperationType.LIST, 'payments(admin)')
    );
    const u5 = onSnapshot(
      collection(db, 'groups'),
      (snap) => setGroups(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GroupItem, 'id'>) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'groups(admin)')
    );
    const u6 = onSnapshot(
      collection(db, 'pages'),
      (snap) => setPages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PageItem, 'id'>) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'pages(admin)')
    );
    const u7 = onSnapshot(
      collection(db, 'adminLogs'),
      (snap) =>
        setLogs(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<AdminLogItem, 'id'>) }))
            .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
        ),
      (err) => handleFirestoreError(err, OperationType.LIST, 'adminLogs')
    );

    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
      u6();
      u7();
    };
  }, [verifyState]);

  if (!firebaseUser) return null;

  if (verifyState === 'loading') {
    return (
      <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center text-sm text-zinc-500">
        {lang === 'ar' ? 'جارٍ التحقق من صلاحيات الإدارة عبر الخادم...' : 'Verifying server-side admin RBAC...'}
      </div>
    );
  }

  if (verifyState === 'denied') {
    return (
      <div className="bg-white dark:bg-[#121216] border border-red-500/40 rounded-2xl p-10 text-center max-w-lg mx-auto my-8 space-y-4">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div className="font-mono text-2xl font-bold text-red-500">403 FORBIDDEN</div>
        <h2 className="font-bold text-lg">
          {lang === 'ar' ? 'الوصول محصور بمسؤولي منصة TIGER فقط' : 'Restricted to TIGER Administrators'}
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{denyReason}</p>
      </div>
    );
  }

  const writeAuditLog = async (action: string, targetType: string, targetId: string, details: string) => {
    await addDoc(collection(db, 'adminLogs'), {
      adminUid: firebaseUser.uid,
      action,
      targetType,
      targetId: targetId.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128) || 'system',
      details: details.slice(0, 600),
      createdAt: serverTimestamp(),
    });
  };

  const toggleSuspendUser = async (u: UserAccount) => {
    const nextSuspended = !u.isSuspended;
    try {
      await updateDoc(doc(db, 'users', u.uid), {
        isSuspended: nextSuspended,
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog(
        nextSuspended ? 'suspend_user' : 'unsuspend_user',
        'user',
        u.uid,
        `${u.email} suspended=${nextSuspended}`
      );
      pushToast(lang === 'ar' ? 'تم تحديث حالة المستخدم' : 'User status updated', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${u.uid}`);
    }
  };

  const updateUserPlan = async (u: UserAccount, nextPlan: 'free' | 'plus' | 'pro') => {
    const quotaMap = {
      free: 512 * 1024 * 1024,
      plus: 50 * 1024 * 1024 * 1024,
      pro: 250 * 1024 * 1024 * 1024,
    };
    try {
      await updateDoc(doc(db, 'users', u.uid), {
        plan: nextPlan,
        storageQuotaBytes: quotaMap[nextPlan],
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog('update_user_plan', 'user', u.uid, `Plan set to ${nextPlan} for ${u.email}`);
      pushToast(lang === 'ar' ? 'تم تحديث خطة المستخدم' : 'User plan updated', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${u.uid}`);
    }
  };

  const deletePostAdmin = async (post: PostItem) => {
    try {
      await deleteDoc(doc(db, 'posts', post.id));
      await writeAuditLog('delete_post', 'post', post.id, `Removed post by ${post.authorName}`);
      pushToast(lang === 'ar' ? 'تم حذف المنشور وتسجيل الإجراء' : 'Post deleted & logged', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `posts/${post.id}`);
    }
  };

  const updateReportStatus = async (report: ReportItem, status: 'reviewed' | 'resolved') => {
    try {
      await updateDoc(doc(db, 'reports', report.id), { status });
      await writeAuditLog('moderate_report', report.targetType, report.targetId, `Report ${report.id} -> ${status}`);
      pushToast(lang === 'ar' ? 'تم تحديث حالة البلاغ' : 'Report updated', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `reports/${report.id}`);
    }
  };

  const verifyPayment = async (payment: PaymentRecordItem, status: 'verified' | 'cancelled') => {
    try {
      await updateDoc(doc(db, 'payments', payment.id), { status });
      if (status === 'verified') {
        const quotaMap = {
          free: 512 * 1024 * 1024,
          plus: 50 * 1024 * 1024 * 1024,
          pro: 250 * 1024 * 1024 * 1024,
        };
        await updateDoc(doc(db, 'users', payment.userId), {
          plan: payment.plan,
          storageQuotaBytes: quotaMap[payment.plan],
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      await writeAuditLog('billing_decision', 'payment', payment.id, `Payment ${payment.id} marked ${status}`);
      pushToast(lang === 'ar' ? 'تم تحديث حالة الدفع' : 'Payment decision saved', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `payments/${payment.id}`);
    }
  };

  const deleteCommunity = async (type: 'groups' | 'pages', id: string, title: string) => {
    try {
      await deleteDoc(doc(db, type, id));
      await writeAuditLog(`delete_${type.slice(0, -1)}`, type, id, `Deleted ${title}`);
      pushToast(lang === 'ar' ? 'تم الحذف بنجاح' : 'Removed successfully', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${type}/${id}`);
    }
  };

  const openReportsCount = reports.filter((r) => r.status === 'open').length;
  const pendingPaymentsCount = payments.filter((p) => p.status === 'pending_verification').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-orange-500" />
            {lang === 'ar' ? 'لوحة إدارة TIGER المركزية' : 'TIGER Admin Control Center'}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {lang === 'ar'
              ? 'إدارة الأعضاء والمحتوى والبلاغات والمدفوعات وسجل الأمان المحمي بـ RBAC.'
              : 'Server-verified RBAC governance for users, content moderation, billing, and immutable audit logs.'}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: Users, label: lang === 'ar' ? 'المستخدمون' : 'Users', val: users.length },
          { icon: FileText, label: lang === 'ar' ? 'المنشورات' : 'Posts', val: posts.length },
          { icon: Flag, label: lang === 'ar' ? 'بلاغات مفتوحة' : 'Open Reports', val: openReportsCount },
          {
            icon: HardDrive,
            label: lang === 'ar' ? 'تخزين الخادم' : 'Server Storage',
            val: serverStats ? formatBytes(serverStats.privateCloudBytes + serverStats.publicMediaBytes) : '0 B',
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4"
          >
            <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span>{kpi.label}</span>
              <kpi.icon className="w-4 h-4 text-orange-500" />
            </div>
            <div className="font-mono text-2xl font-extrabold mt-2 tabular-nums">{kpi.val}</div>
          </div>
        ))}
      </div>

      {/* Admin Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
        {(
          [
            { id: 'overview', ar: 'نظرة عامة', en: 'Overview' },
            { id: 'users', ar: `المستخدمون (${users.length})`, en: `Users (${users.length})` },
            { id: 'posts', ar: `المنشورات (${posts.length})`, en: `Posts (${posts.length})` },
            { id: 'reports', ar: `البلاغات (${openReportsCount})`, en: `Reports (${openReportsCount})` },
            { id: 'payments', ar: `المدفوعات (${pendingPaymentsCount})`, en: `Payments (${pendingPaymentsCount})` },
            { id: 'communities', ar: 'المجموعات والصفحات', en: 'Groups & Pages' },
            { id: 'logs', ar: 'سجل الأمان', en: 'Audit Logs' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
              tab === item.id
                ? 'bg-orange-500 text-white'
                : 'bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
            }`}
          >
            {lang === 'ar' ? item.ar : item.en}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && serverStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 text-orange-500" />
              {lang === 'ar' ? 'إحصائيات الخادم الحية' : 'Live Server Metrics'}
            </h3>
            <div className="space-y-2 text-xs tabular-nums">
              <div className="flex justify-between">
                <span className="text-zinc-500">{lang === 'ar' ? 'اتصالات WebSocket النشطة' : 'Active WebSocket Users'}</span>
                <span className="font-mono font-bold">{serverStats.onlineSockets}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">{lang === 'ar' ? 'ملفات TIGER CLOUD الخاصة' : 'Private Cloud Files'}</span>
                <span className="font-mono font-bold">
                  {serverStats.privateCloudFiles} ({formatBytes(serverStats.privateCloudBytes)})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">{lang === 'ar' ? 'ملفات الوسائط الاجتماعية' : 'Public Media Files'}</span>
                <span className="font-mono font-bold">
                  {serverStats.publicMediaFiles} ({formatBytes(serverStats.publicMediaBytes)})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">{lang === 'ar' ? 'مدة تشغيل الخادم' : 'Server Uptime'}</span>
                <span className="font-mono font-bold">{Math.floor(serverStats.uptimeSeconds / 60)}m</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Users2 className="w-4 h-4 text-orange-500" />
              {lang === 'ar' ? 'ملخص المنصة' : 'Platform Summary'}
            </h3>
            <div className="space-y-2 text-xs tabular-nums">
              <div className="flex justify-between">
                <span className="text-zinc-500">{lang === 'ar' ? 'المجموعات' : 'Groups'}</span>
                <span className="font-mono font-bold">{groups.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">{lang === 'ar' ? 'الصفحات' : 'Pages'}</span>
                <span className="font-mono font-bold">{pages.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">{lang === 'ar' ? 'مدفوعات بانتظار التحقق' : 'Pending Payments'}</span>
                <span className="font-mono font-bold text-amber-500">{pendingPaymentsCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">{lang === 'ar' ? 'سجلات التدقيق المسجلة' : 'Audit Log Entries'}</span>
                <span className="font-mono font-bold">{logs.length}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Users Table */}
      {tab === 'users' && (
        <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500">
              <tr>
                <th className="p-3.5 text-start">{lang === 'ar' ? 'المستخدم' : 'User'}</th>
                <th className="p-3.5 text-start">{lang === 'ar' ? 'الدور' : 'Role'}</th>
                <th className="p-3.5 text-start">{lang === 'ar' ? 'الخطة' : 'Plan'}</th>
                <th className="p-3.5 text-start">{lang === 'ar' ? 'التخزين' : 'Storage'}</th>
                <th className="p-3.5 text-end">{lang === 'ar' ? 'إجراء' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {users.map((u) => (
                <tr key={u.uid}>
                  <td className="p-3.5">
                    <div className="font-bold">{profilesMap[u.uid]?.displayName || u.email}</div>
                    <div className="text-zinc-500">{u.email}</div>
                  </td>
                  <td className="p-3.5 uppercase font-mono">{u.role}</td>
                  <td className="p-3.5">
                    <select
                      value={u.plan}
                      onChange={(e) => updateUserPlan(u, e.target.value as 'free' | 'plus' | 'pro')}
                      className="px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-xs"
                    >
                      <option value="free">FREE</option>
                      <option value="plus">PLUS</option>
                      <option value="pro">PRO</option>
                    </select>
                  </td>
                  <td className="p-3.5 font-mono tabular-nums">{formatBytes(u.storageUsedBytes || 0)}</td>
                  <td className="p-3.5 text-end">
                    <button
                      onClick={() => toggleSuspendUser(u)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer ${
                        u.isSuspended
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : 'bg-red-500/10 text-red-500'
                      }`}
                    >
                      <Ban className="w-3.5 h-3.5" />
                      {u.isSuspended
                        ? lang === 'ar'
                          ? 'إلغاء الإيقاف'
                          : 'Unsuspend'
                        : lang === 'ar'
                        ? 'إيقاف الحساب'
                        : 'Suspend'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Posts Moderation */}
      {tab === 'posts' && (
        <div className="space-y-3">
          {posts.map((p) => (
            <div
              key={p.id}
              className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex items-start justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="text-xs font-bold">
                  {p.authorName} · <span className="text-zinc-500 font-normal">{formatTimeAgo(p.createdAt?.toMillis?.(), lang)}</span>
                </div>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-1 line-clamp-2">{p.content || '[Media Post]'}</p>
              </div>
              <button
                onClick={() => deletePostAdmin(p)}
                className="px-3 py-1.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white text-xs font-semibold inline-flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {lang === 'ar' ? 'حذف' : 'Delete'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Reports */}
      {tab === 'reports' && (
        <div className="space-y-3">
          {reports.length === 0 ? (
            <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center text-sm text-zinc-500">
              {lang === 'ar' ? 'لا توجد بلاغات مسجلة.' : 'No moderation reports filed.'}
            </div>
          ) : (
            reports.map((r) => (
              <div
                key={r.id}
                className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <div className="text-xs font-bold uppercase text-orange-500">
                    {r.targetType} · {r.targetId} · <span className="text-zinc-500">{r.status}</span>
                  </div>
                  <p className="text-sm mt-1">{r.reason}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => updateReportStatus(r, 'reviewed')}
                    className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold cursor-pointer"
                  >
                    {lang === 'ar' ? 'قيد المراجعة' : 'Mark Reviewed'}
                  </button>
                  <button
                    onClick={() => updateReportStatus(r, 'resolved')}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-500 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {lang === 'ar' ? 'تم الحل' : 'Resolve'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Payments Verification */}
      {tab === 'payments' && (
        <div className="space-y-3">
          {payments.length === 0 ? (
            <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center text-sm text-zinc-500">
              {lang === 'ar' ? 'لا توجد عمليات دفع مسجلة.' : 'No payment records yet.'}
            </div>
          ) : (
            payments.map((pay) => (
              <div
                key={pay.id}
                className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <div className="text-xs font-bold flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-orange-500" />
                    <span className="uppercase">TIGER {pay.plan}</span> ·{' '}
                    <span className="font-mono">${(pay.amountCents / 100).toFixed(2)}</span> ·{' '}
                    <span className="text-amber-500">{pay.status}</span>
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    UID: {pay.userId} {pay.note ? `· ${pay.note}` : ''}
                  </div>
                </div>
                {pay.status === 'pending_verification' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => verifyPayment(pay, 'verified')}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                    >
                      {lang === 'ar' ? 'تأكيد وتفعيل الخطة' : 'Verify & Activate'}
                    </button>
                    <button
                      onClick={() => verifyPayment(pay, 'cancelled')}
                      className="px-3 py-1.5 rounded-xl bg-red-500/10 text-red-500 text-xs font-semibold cursor-pointer"
                    >
                      {lang === 'ar' ? 'رفض' : 'Cancel'}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Groups & Pages */}
      {tab === 'communities' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
            <h3 className="font-bold text-sm">{lang === 'ar' ? 'المجموعات' : 'Groups'} ({groups.length})</h3>
            {groups.map((g) => (
              <div key={g.id} className="flex items-center justify-between text-xs py-1.5 border-b border-zinc-100 dark:border-zinc-800/60 last:border-0">
                <span className="font-semibold truncate">{g.name}</span>
                <button
                  onClick={() => deleteCommunity('groups', g.id, g.name)}
                  className="text-red-500 hover:underline cursor-pointer"
                >
                  {lang === 'ar' ? 'حذف' : 'Delete'}
                </button>
              </div>
            ))}
          </div>
          <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
            <h3 className="font-bold text-sm">{lang === 'ar' ? 'الصفحات' : 'Pages'} ({pages.length})</h3>
            {pages.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-xs py-1.5 border-b border-zinc-100 dark:border-zinc-800/60 last:border-0">
                <span className="font-semibold truncate">{p.name}</span>
                <button
                  onClick={() => deleteCommunity('pages', p.id, p.name)}
                  className="text-red-500 hover:underline cursor-pointer"
                >
                  {lang === 'ar' ? 'حذف' : 'Delete'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Security Audit Logs */}
      {tab === 'logs' && (
        <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-2.5">
          <h3 className="font-bold text-sm flex items-center gap-2 mb-2">
            <ClipboardList className="w-4 h-4 text-orange-500" />
            {lang === 'ar' ? 'سجل إجراءات الإدارة (غير قابل للتعديل)' : 'Immutable Admin Audit Trail'}
          </h3>
          {logs.length === 0 ? (
            <p className="text-xs text-zinc-500">{lang === 'ar' ? 'لا توجد سجلات بعد.' : 'No audit entries yet.'}</p>
          ) : (
            logs.map((l) => (
              <div
                key={l.id}
                className="text-xs py-2 border-b border-zinc-100 dark:border-zinc-800/80 last:border-0 flex flex-col sm:flex-row sm:items-center justify-between gap-1"
              >
                <div>
                  <span className="font-mono font-bold text-orange-500">{l.action}</span> ·{' '}
                  <span className="font-semibold">{l.targetType}:{l.targetId}</span>
                  {l.details && <span className="text-zinc-500 ms-2">— {l.details}</span>}
                </div>
                <span className="text-zinc-400 tabular-nums shrink-0">
                  {formatTimeAgo(l.createdAt?.toMillis?.(), lang)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
