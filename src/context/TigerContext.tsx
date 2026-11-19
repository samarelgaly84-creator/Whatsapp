import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  addDoc,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  testFirestoreConnection,
  handleFirestoreError,
  OperationType,
  BOOTSTRAPPED_ADMIN_EMAIL,
} from '../lib/firebase';
import { Lang, translations } from '../lib/i18n';
import {
  NavSection,
  NotificationItem,
  PublicProfile,
  UserAccount,
} from '../types/tiger';
import { TIGER_ASSETS } from '../lib/assets';

export interface ToastItem {
  id: string;
  type: 'info' | 'success' | 'error';
  message: string;
}

export interface ReportTarget {
  targetType: 'post' | 'comment' | 'user' | 'live' | 'file' | 'group' | 'page';
  targetId: string;
  label?: string;
}

type WsListener = (data: Record<string, unknown>) => void;

interface TigerContextValue {
  firebaseUser: User | null;
  account: UserAccount | null;
  profile: PublicProfile | null;
  profilesMap: Record<string, PublicProfile>;
  authReady: boolean;
  dbOffline: boolean;
  isAdmin: boolean;
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: typeof translations['ar'] | typeof translations['en'];
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  activeSection: NavSection;
  setActiveSection: (s: NavSection) => void;
  globalSearch: string;
  setGlobalSearch: (q: string) => void;
  onlineUids: Set<string>;
  wsConnected: boolean;
  sendWs: (payload: Record<string, unknown>) => void;
  subscribeWs: (listener: WsListener) => () => void;
  notifications: NotificationItem[];
  unreadNotifCount: number;
  notifyUser: (params: {
    recipientUid: string;
    type: NotificationItem['type'];
    message: string;
    targetId?: string;
  }) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  toasts: ToastItem[];
  pushToast: (message: string, type?: 'info' | 'success' | 'error') => void;
  dismissToast: (id: string) => void;
  reportTarget: ReportTarget | null;
  openReportModal: (target: ReportTarget) => void;
  closeReportModal: () => void;
  selectedProfileUid: string | null;
  openUserProfile: (uid: string) => void;
  driveAiPreselectIds: string[];
  openDriveAiWithFiles: (fileIds: string[]) => void;
  activeChatId: string | null;
  openDirectChatWith: (otherUid: string) => Promise<void>;
}

const TigerContext = createContext<TigerContextValue | null>(null);

function buildSafeUsername(email: string | null, displayName: string | null, uid: string): string {
  const base = (email?.split('@')[0] || displayName || 'tiger')
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 22);
  const suffix = uid.slice(0, 5).toLowerCase();
  const candidate = `${base || 'tiger'}_${suffix}`;
  return candidate.length >= 2 ? candidate : `tiger_${suffix}`;
}

export function TigerProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [profilesMap, setProfilesMap] = useState<Record<string, PublicProfile>>({});
  const [authReady, setAuthReady] = useState(false);
  const [dbOffline, setDbOffline] = useState(false);

  const [lang, setLangState] = useState<Lang>('ar');
  const [theme, setThemeState] = useState<'dark' | 'light'>('dark');
  const [activeSection, setActiveSection] = useState<NavSection>('feed');
  const [globalSearch, setGlobalSearch] = useState('');
  const [onlineUids, setOnlineUids] = useState<Set<string>>(new Set());
  const [wsConnected, setWsConnected] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [selectedProfileUid, setSelectedProfileUid] = useState<string | null>(null);
  const [driveAiPreselectIds, setDriveAiPreselectIds] = useState<string[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const wsListenersRef = useRef<Set<WsListener>>(new Set());
  const reconnectTimerRef = useRef<number | null>(null);

  const pushToast = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, type, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // Sync HTML dir, lang, and dark class
  useEffect(() => {
    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    const html = document.documentElement;
    if (theme === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }, [theme]);

  const setLang = useCallback(
    (next: Lang) => {
      setLangState(next);
      if (firebaseUser) {
        updateDoc(doc(db, 'users', firebaseUser.uid), {
          language: next,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    },
    [firebaseUser]
  );

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      if (firebaseUser) {
        updateDoc(doc(db, 'users', firebaseUser.uid), {
          theme: next,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      return next;
    });
  }, [firebaseUser]);

  // Startup Firestore connectivity probe
  useEffect(() => {
    testFirestoreConnection().then((res) => {
      if (!res.ok) setDbOffline(true);
    });
  }, []);

  // Firebase Auth listener + automatic account/profile provisioning
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setAccount(null);
        setProfile(null);
        setAuthReady(true);
        return;
      }

      try {
        const userRef = doc(db, 'users', user.uid);
        const pubRef = doc(db, 'publicProfiles', user.uid);
        const [userSnap, pubSnap] = await Promise.all([getDoc(userRef), getDoc(pubRef)]);

        const isBootstrappedAdmin =
          user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase() && user.emailVerified;

        if (!userSnap.exists()) {
          await setDoc(userRef, {
            uid: user.uid,
            email: user.email || `${user.uid}@tiger.local`,
            role: isBootstrappedAdmin ? 'admin' : 'user',
            plan: 'free',
            storageQuotaBytes: 512 * 1024 * 1024,
            storageUsedBytes: 0,
            aiRequestsCount: 0,
            language: lang,
            theme,
            privacyDefault: 'public',
            notifyMessages: true,
            notifySocial: true,
            isSuspended: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        if (!pubSnap.exists()) {
          await setDoc(pubRef, {
            uid: user.uid,
            displayName: (user.displayName || user.email?.split('@')[0] || 'TIGER Member').slice(0, 80),
            username: buildSafeUsername(user.email, user.displayName, user.uid),
            bio: '',
            avatarUrl: user.photoURL || TIGER_ASSETS.logo,
            coverUrl: TIGER_ASSETS.coverStudio,
            location: '',
            website: '',
            friendsCount: 0,
            followersCount: 0,
            isVerified: isBootstrappedAdmin,
            onlineStatus: 'online',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(pubRef, {
            onlineStatus: 'online',
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
      } catch (err) {
        console.error('Profile bootstrap warning:', err);
      } finally {
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, []);

  // Live subscription to current user's account, profile, public profiles directory, and notifications
  useEffect(() => {
    if (!firebaseUser) return;

    const unsubAcc = onSnapshot(
      doc(db, 'users', firebaseUser.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserAccount;
          setAccount(data);
          if (data.language === 'ar' || data.language === 'en') setLangState(data.language);
          if (data.theme === 'dark' || data.theme === 'light') setThemeState(data.theme);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`)
    );

    const unsubPub = onSnapshot(
      doc(db, 'publicProfiles', firebaseUser.uid),
      (snap) => {
        if (snap.exists()) setProfile(snap.data() as PublicProfile);
      },
      (err) => handleFirestoreError(err, OperationType.GET, `publicProfiles/${firebaseUser.uid}`)
    );

    const unsubAllProfiles = onSnapshot(
      collection(db, 'publicProfiles'),
      (snap) => {
        const map: Record<string, PublicProfile> = {};
        snap.forEach((d) => {
          const p = d.data() as PublicProfile;
          map[d.id] = p;
        });
        setProfilesMap(map);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'publicProfiles')
    );

    const notifQuery = query(
      collection(db, 'notifications'),
      where('recipientUid', '==', firebaseUser.uid)
    );
    const unsubNotif = onSnapshot(
      notifQuery,
      (snap) => {
        const list: NotificationItem[] = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<NotificationItem, 'id'>) }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setNotifications(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
    );

    return () => {
      unsubAcc();
      unsubPub();
      unsubAllProfiles();
      unsubNotif();
    };
  }, [firebaseUser]);

  // Real-Time WebSocket Connection + Reconnection
  const sendWs = useCallback((payload: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const subscribeWs = useCallback((listener: WsListener) => {
    wsListenersRef.current.add(listener);
    return () => {
      wsListenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!firebaseUser) {
      wsRef.current?.close();
      wsRef.current = null;
      setWsConnected(false);
      return;
    }

    let cancelled = false;

    const connect = async () => {
      try {
        const token = await firebaseUser.getIdToken();
        if (cancelled) return;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
          ws.send(
            JSON.stringify({
              type: 'auth',
              token,
              displayName: firebaseUser.displayName || firebaseUser.email || 'TIGER User',
            })
          );
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as Record<string, unknown>;
            if (data.type === 'presence:list' && Array.isArray(data.onlineUids)) {
              setOnlineUids(new Set(data.onlineUids as string[]));
            }
            if (data.type === 'notification:new' && typeof data.message === 'string') {
              pushToast(`${String(data.actorName || '')}: ${data.message}`, 'info');
            }
            wsListenersRef.current.forEach((fn) => fn(data));
          } catch {
            // ignore malformed frames
          }
        };

        ws.onclose = () => {
          setWsConnected(false);
          if (!cancelled) {
            reconnectTimerRef.current = window.setTimeout(connect, 3500);
          }
        };
      } catch {
        if (!cancelled) {
          reconnectTimerRef.current = window.setTimeout(connect, 5000);
        }
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [firebaseUser, pushToast]);

  const notifyUser = useCallback(
    async ({
      recipientUid,
      type,
      message,
      targetId,
    }: {
      recipientUid: string;
      type: NotificationItem['type'];
      message: string;
      targetId?: string;
    }) => {
      if (!firebaseUser || !profile || recipientUid === firebaseUser.uid) return;
      try {
        await addDoc(collection(db, 'notifications'), {
          recipientUid,
          actorUid: firebaseUser.uid,
          actorName: profile.displayName,
          type,
          targetId: targetId || '',
          message: message.slice(0, 290),
          isRead: false,
          createdAt: serverTimestamp(),
        });
        sendWs({
          type: 'notification:push',
          recipientUid,
          notifType: type,
          message,
        });
      } catch (err) {
        console.error('Notification dispatch failed:', err);
      }
    },
    [firebaseUser, profile, sendWs]
  );

  const signInWithGoogle = useCallback(async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      pushToast(lang === 'ar' ? 'أهلاً بك في منصة TIGER' : 'Welcome to TIGER', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed';
      pushToast(msg, 'error');
    }
  }, [lang, pushToast]);

  const signOut = useCallback(async () => {
    try {
      if (firebaseUser) {
        await updateDoc(doc(db, 'publicProfiles', firebaseUser.uid), {
          onlineStatus: 'offline',
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      await firebaseSignOut(auth);
      setActiveSection('feed');
      pushToast(lang === 'ar' ? 'تم تسجيل الخروج بنجاح' : 'Signed out successfully', 'info');
    } catch (err) {
      console.error(err);
    }
  }, [firebaseUser, lang, pushToast]);

  const openUserProfile = useCallback((uid: string) => {
    setSelectedProfileUid(uid);
    setActiveSection('profile');
  }, []);

  const openDriveAiWithFiles = useCallback((fileIds: string[]) => {
    setDriveAiPreselectIds(fileIds);
    setActiveSection('driveAi');
  }, []);

  const openDirectChatWith = useCallback(
    async (otherUid: string) => {
      if (!firebaseUser || !profile || otherUid === firebaseUser.uid) return;
      const pairId = [firebaseUser.uid, otherUid].sort().join('_');
      const chatRef = doc(db, 'chats', `dm_${pairId}`);
      try {
        const snap = await getDoc(chatRef);
        if (!snap.exists()) {
          const otherProfile = profilesMap[otherUid];
          await setDoc(chatRef, {
            type: 'direct',
            name: otherProfile?.displayName || 'Direct Chat',
            ownerUid: firebaseUser.uid,
            participantUids: [firebaseUser.uid, otherUid],
            lastMessageText: '',
            lastMessageSenderUid: '',
            e2eeEnabled: false,
            pinnedBy: [],
            archivedBy: [],
            mutedBy: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        setActiveChatId(`dm_${pairId}`);
        setActiveSection('chat');
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `chats/dm_${pairId}`);
      }
    },
    [firebaseUser, profile, profilesMap]
  );

  const isAdmin =
    Boolean(
      firebaseUser?.emailVerified &&
        (firebaseUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase() ||
          account?.role === 'admin')
    );

  const unreadNotifCount = notifications.filter((n) => !n.isRead).length;

  return (
    <TigerContext.Provider
      value={{
        firebaseUser,
        account,
        profile,
        profilesMap,
        authReady,
        dbOffline,
        isAdmin,
        lang,
        setLang,
        t: translations[lang],
        theme,
        toggleTheme,
        activeSection,
        setActiveSection,
        globalSearch,
        setGlobalSearch,
        onlineUids,
        wsConnected,
        sendWs,
        subscribeWs,
        notifications,
        unreadNotifCount,
        notifyUser,
        signInWithGoogle,
        signOut,
        toasts,
        pushToast,
        dismissToast,
        reportTarget,
        openReportModal: setReportTarget,
        closeReportModal: () => setReportTarget(null),
        selectedProfileUid,
        openUserProfile,
        driveAiPreselectIds,
        openDriveAiWithFiles,
        activeChatId,
        openDirectChatWith,
      }}
    >
      {children}
    </TigerContext.Provider>
  );
}

export function useTiger() {
  const ctx = useContext(TigerContext);
  if (!ctx) throw new Error('useTiger must be used inside TigerProvider');
  return ctx;
}
