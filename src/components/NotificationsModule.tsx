import React, { useState } from 'react';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import {
  Bell,
  CheckCheck,
  Trash2,
  MessageCircle,
  UserPlus,
  Heart,
  MessageSquare,
  Share2,
  Users2,
  Flag,
  Cloud,
  Radio,
  Check,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useTiger } from '../context/TigerContext';
import { NavSection, NotificationItem } from '../types/tiger';
import { formatTimeAgo } from '../lib/upload';

export function NotificationsModule() {
  const { notifications, unreadNotifCount, lang, setActiveSection, openUserProfile, pushToast } = useTiger();
  const [filter, setFilter] = useState<'all' | 'unread' | 'messages' | 'social' | 'community'>('all');
  const [busyAll, setBusyAll] = useState(false);

  const filtered = notifications.filter((n) => {
    if (filter === 'unread') return !n.isRead;
    if (filter === 'messages') return n.type === 'message';
    if (filter === 'social') return ['like', 'comment', 'share', 'mention', 'follow', 'friend_request'].includes(n.type);
    if (filter === 'community') return ['group', 'page', 'file_share', 'live'].includes(n.type);
    return true;
  });

  const markRead = async (notif: NotificationItem) => {
    if (notif.isRead) return;
    try {
      await updateDoc(doc(db, 'notifications', notif.id), { isRead: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `notifications/${notif.id}`);
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.isRead);
    if (unread.length === 0) return;
    setBusyAll(true);
    try {
      await Promise.all(unread.map((n) => updateDoc(doc(db, 'notifications', n.id), { isRead: true })));
      pushToast(lang === 'ar' ? 'تم تحديد جميع الإشعارات كمقروءة' : 'All notifications marked as read', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'notifications(all)');
    } finally {
      setBusyAll(false);
    }
  };

  const removeNotif = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `notifications/${id}`);
    }
  };

  const openTarget = async (notif: NotificationItem) => {
    await markRead(notif);
    const map: Record<NotificationItem['type'], NavSection> = {
      message: 'chat',
      friend_request: 'friends',
      like: 'feed',
      comment: 'feed',
      share: 'feed',
      mention: 'feed',
      follow: 'friends',
      group: 'groups',
      page: 'pages',
      file_share: 'cloud',
      live: 'live',
    };
    if (notif.type === 'follow' && notif.actorUid) {
      openUserProfile(notif.actorUid);
      return;
    }
    setActiveSection(map[notif.type] || 'feed');
  };

  const getIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'message':
        return <MessageCircle className="w-4 h-4 text-orange-500" />;
      case 'friend_request':
      case 'follow':
        return <UserPlus className="w-4 h-4 text-emerald-500" />;
      case 'like':
        return <Heart className="w-4 h-4 text-rose-500" />;
      case 'comment':
      case 'mention':
        return <MessageSquare className="w-4 h-4 text-sky-500" />;
      case 'share':
        return <Share2 className="w-4 h-4 text-amber-500" />;
      case 'group':
        return <Users2 className="w-4 h-4 text-indigo-500" />;
      case 'page':
        return <Flag className="w-4 h-4 text-orange-500" />;
      case 'file_share':
        return <Cloud className="w-4 h-4 text-cyan-500" />;
      case 'live':
        return <Radio className="w-4 h-4 text-red-500" />;
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight flex items-center gap-2.5">
            <Bell className="w-6 h-6 text-orange-500" />
            {lang === 'ar' ? 'مركز إشعارات TIGER' : 'TIGER Notifications'}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 tabular-nums">
            {unreadNotifCount} {lang === 'ar' ? 'إشعار غير مقروء' : 'unread'} · {notifications.length}{' '}
            {lang === 'ar' ? 'إجمالي الإشعارات' : 'total'}
          </p>
        </div>

        <button
          onClick={markAllRead}
          disabled={busyAll || unreadNotifCount === 0}
          className="px-4 py-2 rounded-xl bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 hover:border-orange-500 text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-40 cursor-pointer"
        >
          <CheckCheck className="w-4 h-4 text-orange-500" />
          {lang === 'ar' ? 'تحديد الكل كمقروء' : 'Mark All Read'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
        {(
          [
            { id: 'all', ar: 'الكل', en: 'All' },
            { id: 'unread', ar: 'غير مقروء', en: 'Unread' },
            { id: 'messages', ar: 'الرسائل', en: 'Messages' },
            { id: 'social', ar: 'التفاعل والأصدقاء', en: 'Social' },
            { id: 'community', ar: 'المجموعات والسحابة والبث', en: 'Groups, Cloud & Live' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            onClick={() => setFilter(item.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              filter === item.id
                ? 'bg-orange-500 text-white'
                : 'bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
            }`}
          >
            {lang === 'ar' ? item.ar : item.en}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center space-y-2">
          <Bell className="w-8 h-8 mx-auto text-zinc-400" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {lang === 'ar' ? 'لا توجد إشعارات في هذا التصنيف حالياً.' : 'No notifications in this filter right now.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80 bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
          {filtered.map((notif) => (
            <div
              key={notif.id}
              className={`p-4 flex items-start justify-between gap-3 transition-colors ${
                notif.isRead ? '' : 'bg-orange-500/5'
              }`}
            >
              <button
                onClick={() => openTarget(notif)}
                className="flex items-start gap-3 text-start flex-1 min-w-0 cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                  {getIcon(notif.type)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm leading-snug">
                    <span className="font-bold">{notif.actorName}</span>{' '}
                    <span className="text-zinc-700 dark:text-zinc-300">{notif.message}</span>
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 tabular-nums">
                    {formatTimeAgo(notif.createdAt?.toMillis?.(), lang)}
                    {!notif.isRead && (
                      <span className="text-orange-500 font-semibold ms-2">
                        · {lang === 'ar' ? 'جديد' : 'New'}
                      </span>
                    )}
                  </div>
                </div>
              </button>

              <div className="flex items-center gap-1 shrink-0">
                {!notif.isRead && (
                  <button
                    onClick={() => markRead(notif)}
                    title={lang === 'ar' ? 'تحديد كمقروء' : 'Mark read'}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-orange-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => removeNotif(notif.id)}
                  title={lang === 'ar' ? 'حذف' : 'Delete'}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
