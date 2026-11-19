import React, { useEffect, useState } from 'react';
import {
  Home,
  Film,
  Radio,
  MessageCircle,
  Cloud,
  Sparkles,
  FileSearch,
  Users,
  Users2,
  Flag,
  User as UserIcon,
  Bell,
  Crown,
  Settings,
  ShieldCheck,
  Search,
  Sun,
  Moon,
  Menu,
  X,
  WifiOff,
  AlertTriangle,
  HardDrive,
} from 'lucide-react';
import { useTiger } from './context/TigerContext';
import { NavSection } from './types/tiger';
import { TIGER_ASSETS } from './lib/assets';
import { formatBytes } from './lib/upload';
import { LoadingScreen, NotFoundView, TigerAvatar } from './components/StatusViews';
import { AuthGate } from './components/AuthGate';
import { ReportModal } from './components/ReportModal';
import { SocialFeed } from './components/SocialFeed';
import { ReelsModule } from './components/ReelsModule';
import { LiveModule } from './components/LiveModule';
import { ChatModule } from './components/ChatModule';
import { CloudModule } from './components/CloudModule';
import { AiModule } from './components/AiModule';
import { FriendsModule } from './components/FriendsModule';
import { GroupsModule } from './components/GroupsModule';
import { PagesModule } from './components/PagesModule';
import { ProfileModule } from './components/ProfileModule';
import { NotificationsModule } from './components/NotificationsModule';
import { PremiumModule } from './components/PremiumModule';
import { SettingsModule } from './components/SettingsModule';
import { AdminModule } from './components/AdminModule';

const VALID_SECTIONS: NavSection[] = [
  'feed',
  'reels',
  'live',
  'chat',
  'cloud',
  'ai',
  'driveAi',
  'friends',
  'groups',
  'pages',
  'profile',
  'notifications',
  'premium',
  'settings',
  'admin',
];

export default function App() {
  const {
    firebaseUser,
    account,
    profile,
    profilesMap,
    authReady,
    dbOffline,
    isAdmin,
    lang,
    setLang,
    t,
    theme,
    toggleTheme,
    activeSection,
    setActiveSection,
    globalSearch,
    setGlobalSearch,
    onlineUids,
    unreadNotifCount,
    toasts,
    dismissToast,
    openUserProfile,
    openDirectChatWith,
  } = useTiger();

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Hash-based section sync (supports clean 404 fallback on unknown hash)
  useEffect(() => {
    const syncFromHash = () => {
      const raw = window.location.hash.replace(/^#\/?/, '').trim();
      if (!raw) return;
      if (VALID_SECTIONS.includes(raw as NavSection)) {
        setActiveSection(raw as NavSection);
      } else {
        setActiveSection('notFound');
      }
    };
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, [setActiveSection]);

  const navigate = (section: NavSection) => {
    if (section === 'profile' && firebaseUser) {
      openUserProfile(firebaseUser.uid);
    } else {
      setActiveSection(section);
    }
    window.history.replaceState(null, '', `#/${section}`);
    setMobileNavOpen(false);
  };

  if (!authReady) {
    return <LoadingScreen label={lang === 'ar' ? 'جارٍ تهيئة منصة TIGER...' : 'Initializing TIGER Platform...'} />;
  }

  if (!firebaseUser) {
    return <AuthGate />;
  }

  const navGroups: Array<{
    titleAr: string;
    titleEn: string;
    items: Array<{ id: NavSection; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }>;
  }> = [
    {
      titleAr: 'المنصة الأساسية',
      titleEn: 'Core Platform',
      items: [
        { id: 'feed', label: t.nav.feed, icon: Home },
        { id: 'reels', label: t.nav.reels, icon: Film },
        { id: 'live', label: t.nav.live, icon: Radio },
        { id: 'chat', label: t.nav.chat, icon: MessageCircle },
        { id: 'cloud', label: t.nav.cloud, icon: Cloud },
        { id: 'ai', label: t.nav.ai, icon: Sparkles },
        { id: 'driveAi', label: t.nav.driveAi, icon: FileSearch },
      ],
    },
    {
      titleAr: 'المجتمع',
      titleEn: 'Community',
      items: [
        { id: 'friends', label: t.nav.friends, icon: Users },
        { id: 'groups', label: t.nav.groups, icon: Users2 },
        { id: 'pages', label: t.nav.pages, icon: Flag },
        { id: 'profile', label: t.nav.profile, icon: UserIcon },
      ],
    },
    {
      titleAr: 'الحساب والإدارة',
      titleEn: 'Account & Control',
      items: [
        { id: 'notifications', label: t.nav.notifications, icon: Bell, badge: unreadNotifCount },
        { id: 'premium', label: t.nav.premium, icon: Crown },
        { id: 'settings', label: t.nav.settings, icon: Settings },
        ...(isAdmin ? [{ id: 'admin' as NavSection, label: t.nav.admin, icon: ShieldCheck }] : []),
      ],
    },
  ];

  const usedBytes = account?.storageUsedBytes || 0;
  const quotaBytes = account?.storageQuotaBytes || 512 * 1024 * 1024;
  const storagePct = Math.min(100, Math.round((usedBytes / Math.max(1, quotaBytes)) * 100));

  const onlineMembers = Object.values(profilesMap)
    .filter((p) => p.uid !== firebaseUser.uid && onlineUids.has(p.uid))
    .slice(0, 8);

  const renderSection = () => {
    switch (activeSection) {
      case 'feed':
        return <SocialFeed />;
      case 'reels':
        return <ReelsModule />;
      case 'live':
        return <LiveModule />;
      case 'chat':
        return <ChatModule />;
      case 'cloud':
        return <CloudModule />;
      case 'ai':
        return <AiModule initialTab="chat" />;
      case 'driveAi':
        return <AiModule initialTab="drive" />;
      case 'friends':
        return <FriendsModule />;
      case 'groups':
        return <GroupsModule />;
      case 'pages':
        return <PagesModule />;
      case 'profile':
        return <ProfileModule />;
      case 'notifications':
        return <NotificationsModule />;
      case 'premium':
        return <PremiumModule />;
      case 'settings':
        return <SettingsModule />;
      case 'admin':
        return <AdminModule />;
      default:
        return <NotFoundView lang={lang} onBack={() => navigate('feed')} />;
    }
  };

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full justify-between p-3 gap-4 overflow-y-auto">
      <div className="space-y-5">
        {navGroups.map((group) => (
          <div key={group.titleEn} className="space-y-1">
            <div className="px-3 text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {lang === 'ar' ? group.titleAr : group.titleEn}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.id)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'bg-orange-500 text-white'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-zinc-500 dark:text-zinc-400'}`} />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge && item.badge > 0 ? (
                    <span
                      className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-md tabular-nums ${
                        active ? 'bg-white/20 text-white' : 'bg-orange-500 text-white'
                      }`}
                    >
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Storage Quota Compact Summary */}
      <button
        onClick={() => navigate('cloud')}
        className="w-full text-start p-3.5 rounded-2xl bg-zinc-100 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 hover:border-orange-500/40 transition-colors space-y-2 cursor-pointer"
      >
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-orange-500" />
            TIGER CLOUD
          </span>
          <span className="font-mono text-zinc-500 tabular-nums">{storagePct}%</span>
        </div>
        <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${storagePct}%` }} />
        </div>
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
          {formatBytes(usedBytes)} / {formatBytes(quotaBytes)}
        </div>
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#09090B] text-zinc-900 dark:text-zinc-100 flex flex-col">
      {/* Top Single-Row Header */}
      <header className="sticky top-0 z-40 h-16 bg-white/90 dark:bg-[#09090B]/90 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-[1600px] mx-auto h-full px-3 sm:px-5 flex items-center justify-between gap-3">
          {/* Brand + Mobile Drawer Trigger */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open Navigation"
              className="lg:hidden p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigate('feed')}
              className="flex items-center gap-2.5 cursor-pointer group"
            >
              <img
                src={TIGER_ASSETS.logo}
                alt="TIGER"
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-xl object-cover border border-orange-500/40"
              />
              <span className="font-display text-xl font-extrabold tracking-tight">
                TIGER
              </span>
            </button>
          </div>

          {/* Global Search */}
          <div className="flex-1 max-w-md hidden sm:block">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute top-1/2 -translate-y-1/2 start-3.5" />
              <input
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full ps-10 pe-4 py-2 rounded-xl bg-zinc-100 dark:bg-[#121216] border border-transparent focus:border-orange-500 text-xs sm:text-sm focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 hover:border-orange-500 text-xs font-bold cursor-pointer"
              title="Switch Language"
            >
              {lang === 'ar' ? 'EN' : 'عربي'}
            </button>

            <button
              onClick={toggleTheme}
              aria-label="Toggle Theme"
              className="p-2 rounded-xl bg-zinc-100 dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 hover:border-orange-500 cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-orange-400" /> : <Moon className="w-4 h-4 text-zinc-700" />}
            </button>

            <button
              onClick={() => navigate('notifications')}
              aria-label="Notifications"
              className="relative p-2 rounded-xl bg-zinc-100 dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 hover:border-orange-500 cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {unreadNotifCount > 0 && (
                <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-orange-500 text-white text-[10px] font-mono font-bold flex items-center justify-center tabular-nums">
                  {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                </span>
              )}
            </button>

            <button
              onClick={() => navigate('profile')}
              className="flex items-center gap-2 ps-1 pe-2 py-1 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
            >
              <TigerAvatar
                src={profile?.avatarUrl || firebaseUser.photoURL || undefined}
                name={profile?.displayName || firebaseUser.displayName || 'TIGER'}
                size="sm"
              />
              <span className="hidden md:block text-xs font-bold max-w-[110px] truncate">
                {profile?.displayName || firebaseUser.displayName}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Banners (Offline DB or Suspended Account) */}
      {dbOffline && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>
            {lang === 'ar'
              ? 'اتصال قاعدة البيانات متقطع حالياً. ستتم مزامنة التغييرات تلقائياً فور عودة الاتصال.'
              : 'Database connection appears offline. Changes will sync automatically when reconnected.'}
          </span>
        </div>
      )}

      {account?.isSuspended && (
        <div className="bg-red-500/15 border-b border-red-500/30 px-4 py-2 text-xs text-red-700 dark:text-red-300 flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            {lang === 'ar'
              ? 'حسابك موقوف حالياً من قِبل الإدارة. بعض الميزات قد تكون مقيدة.'
              : 'Your account is currently flagged as suspended by an administrator.'}
          </span>
        </div>
      )}

      {/* Main 3-Zone Responsive Shell */}
      <div className="flex-1 max-w-[1600px] w-full mx-auto flex min-h-0">
        {/* Desktop Navigation Rail */}
        <aside className="hidden lg:block w-64 shrink-0 border-e border-zinc-200 dark:border-zinc-800 sticky top-16 h-[calc(100vh-4rem)]">
          {renderSidebarContent()}
        </aside>

        {/* Primary Workspace */}
        <main className="flex-1 min-w-0 px-3 sm:px-6 py-5 pb-20 lg:pb-8">
          {renderSection()}
        </main>

        {/* Contextual Right Dock on Feed (Desktop xl+) */}
        {activeSection === 'feed' && (
          <aside className="hidden xl:block w-72 shrink-0 border-s border-zinc-200 dark:border-zinc-800 p-4 space-y-5 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
            {/* Quick AI & Cloud Launchers */}
            <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-2.5">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                {lang === 'ar' ? 'اختصارات ذكية' : 'Quick Workspace'}
              </div>
              <button
                onClick={() => navigate('driveAi')}
                className="w-full p-3 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-start transition-colors cursor-pointer"
              >
                <div className="text-xs font-bold text-orange-600 dark:text-orange-400 flex items-center gap-1.5">
                  <FileSearch className="w-4 h-4" />
                  TIGER DRIVE AI
                </div>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-1">
                  {lang === 'ar'
                    ? 'لخّص وحلّل ملفاتك السحابية PDF و Word بذكاء.'
                    : 'Summarize, quiz, and query your TIGER Cloud files.'}
                </p>
              </button>
              <button
                onClick={() => navigate('ai')}
                className="w-full p-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 hover:border-orange-500/40 border border-transparent text-start transition-colors cursor-pointer"
              >
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-orange-500" />
                  TIGER AI Studio
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  {lang === 'ar' ? 'مساعد كتابة وبرمجة وتوليد صور إبداعية.' : 'Writing, coding, translation & SVG art studio.'}
                </p>
              </button>
            </div>

            {/* Online Friends & Members */}
            <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                <span>{lang === 'ar' ? 'متصلون الآن' : 'Online Now'}</span>
                <span className="font-mono tabular-nums">{onlineMembers.length}</span>
              </div>
              {onlineMembers.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  {lang === 'ar' ? 'لا يوجد أعضاء آخرون متصلون في هذه اللحظة.' : 'No other members online right now.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {onlineMembers.map((member) => (
                    <button
                      key={member.uid}
                      onClick={() => openDirectChatWith(member.uid)}
                      className="w-full flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 text-start cursor-pointer"
                    >
                      <TigerAvatar src={member.avatarUrl} name={member.displayName} size="sm" online />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold truncate">{member.displayName}</div>
                        <div className="text-[11px] text-zinc-500 truncate">@{member.username}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Mobile Slide-Over Navigation Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)} />
          <div className="relative w-72 max-w-[85vw] bg-white dark:bg-[#09090B] h-full border-e border-zinc-200 dark:border-zinc-800 flex flex-col z-10">
            <div className="h-16 px-4 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <img
                  src={TIGER_ASSETS.logo}
                  alt="TIGER"
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-xl object-cover border border-orange-500/40"
                />
                <span className="font-display font-extrabold text-lg">TIGER</span>
              </div>
              <button onClick={() => setMobileNavOpen(false)} className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{renderSidebarContent()}</div>
          </div>
        </div>
      )}

      {/* Compact Mobile Bottom Quick Bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-14 bg-white/95 dark:bg-[#09090B]/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 grid grid-cols-5">
        {(
          [
            { id: 'feed', icon: Home, label: t.nav.feed },
            { id: 'reels', icon: Film, label: t.nav.reels },
            { id: 'chat', icon: MessageCircle, label: t.nav.chat },
            { id: 'cloud', icon: Cloud, label: 'Cloud' },
            { id: 'ai', icon: Sparkles, label: 'AI' },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold cursor-pointer ${
                active ? 'text-orange-500' : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="truncate max-w-[60px]">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Global Moderation Report Modal */}
      <ReportModal />

      {/* Toast Notification Stack */}
      {toasts.length > 0 && (
        <div className="fixed bottom-16 lg:bottom-5 end-4 z-50 space-y-2 max-w-sm w-[calc(100vw-2rem)]">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`px-4 py-3 rounded-xl border text-xs font-semibold shadow-lg flex items-center justify-between gap-3 ${
                toast.type === 'error'
                  ? 'bg-red-950/95 border-red-500/40 text-red-100'
                  : toast.type === 'success'
                  ? 'bg-zinc-950/95 border-orange-500/50 text-white'
                  : 'bg-zinc-900/95 border-zinc-700 text-zinc-100'
              }`}
            >
              <span>{toast.message}</span>
              <button onClick={() => dismissToast(toast.id)} className="opacity-70 hover:opacity-100 cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
