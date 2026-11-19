import React, { useState } from 'react';
import {
  doc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import {
  Settings,
  User,
  Globe,
  Moon,
  Sun,
  Shield,
  Bell,
  Download,
  LogOut,
  Trash2,
  Camera,
  Check,
  KeyRound,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useTiger } from '../context/TigerContext';
import { uploadPublicMedia } from '../lib/upload';
import { TigerAvatar } from './StatusViews';

export function SettingsModule() {
  const {
    firebaseUser,
    account,
    profile,
    lang,
    setLang,
    theme,
    toggleTheme,
    signOut,
    pushToast,
  } = useTiger();

  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [location, setLocation] = useState(profile?.location || '');
  const [privacyDefault, setPrivacyDefault] = useState<'public' | 'friends' | 'private'>(
    account?.privacyDefault || 'public'
  );
  const [notifyMessages, setNotifyMessages] = useState(account?.notifyMessages ?? true);
  const [notifySocial, setNotifySocial] = useState(account?.notifySocial ?? true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!firebaseUser || !account || !profile) return null;

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const uploaded = await uploadPublicMedia(file);
      await updateDoc(doc(db, 'publicProfiles', firebaseUser.uid), {
        avatarUrl: uploaded.url,
        updatedAt: serverTimestamp(),
      });
      pushToast(lang === 'ar' ? 'تم تحديث الصورة الشخصية' : 'Avatar updated', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Upload failed', 'error');
    }
  };

  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const uploaded = await uploadPublicMedia(file);
      await updateDoc(doc(db, 'publicProfiles', firebaseUser.uid), {
        coverUrl: uploaded.url,
        updatedAt: serverTimestamp(),
      });
      pushToast(lang === 'ar' ? 'تم تحديث صورة الغلاف' : 'Cover updated', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Upload failed', 'error');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await Promise.all([
        updateDoc(doc(db, 'publicProfiles', firebaseUser.uid), {
          displayName: displayName.trim().slice(0, 80) || profile.displayName,
          bio: bio.trim().slice(0, 400),
          location: location.trim().slice(0, 100),
          updatedAt: serverTimestamp(),
        }),
        updateDoc(doc(db, 'users', firebaseUser.uid), {
          privacyDefault,
          notifyMessages,
          notifySocial,
          updatedAt: serverTimestamp(),
        }),
      ]);
      pushToast(lang === 'ar' ? 'تم حفظ الإعدادات بنجاح' : 'Settings saved successfully', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${firebaseUser.uid}`);
    } finally {
      setSaving(false);
    }
  };

  const handleExportData = async () => {
    setExporting(true);
    try {
      const [postsSnap, filesSnap, aiSnap] = await Promise.all([
        getDocs(query(collection(db, 'posts'), where('authorUid', '==', firebaseUser.uid))),
        getDocs(query(collection(db, 'cloudFiles'), where('ownerUid', '==', firebaseUser.uid))),
        getDocs(query(collection(db, 'aiConversations'), where('ownerUid', '==', firebaseUser.uid))),
      ]);

      const payload = {
        exportedAt: new Date().toISOString(),
        platform: 'TIGER',
        account,
        profile,
        posts: postsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        cloudFiles: filesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        aiConversations: aiSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tiger-account-export-${profile.username}.json`;
      a.click();
      URL.revokeObjectURL(url);
      pushToast(lang === 'ar' ? 'تم تحميل نسخة كاملة من بياناتك' : 'Account data exported as JSON', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'publicProfiles', firebaseUser.uid));
      await deleteDoc(doc(db, 'users', firebaseUser.uid));
      await signOut();
      pushToast(lang === 'ar' ? 'تم حذف بيانات حسابك وتسجيل الخروج' : 'Account records removed & signed out', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${firebaseUser.uid}`);
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight flex items-center gap-2.5">
          <Settings className="w-6 h-6 text-orange-500" />
          {lang === 'ar' ? 'إعدادات الحساب والخصوصية' : 'Account & Privacy Settings'}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          {lang === 'ar'
            ? 'تحكم في هويتك، المظهر، اللغة، الخصوصية، الإشعارات وتصدير بياناتك.'
            : 'Manage your identity, appearance, language, privacy defaults, notifications, and data portability.'}
        </p>
      </div>

      {/* Appearance & Language */}
      <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-orange-500" />
            <div>
              <div className="font-bold text-sm">{lang === 'ar' ? 'لغة الواجهة (RTL / LTR)' : 'Interface Language'}</div>
              <div className="text-xs text-zinc-500">{lang === 'ar' ? 'العربية أو الإنجليزية' : 'Arabic RTL or English LTR'}</div>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl">
            <button
              onClick={() => setLang('ar')}
              className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                lang === 'ar' ? 'bg-orange-500 text-white' : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              العربية
            </button>
            <button
              onClick={() => setLang('en')}
              className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                lang === 'en' ? 'bg-orange-500 text-white' : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              English
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {theme === 'dark' ? <Moon className="w-5 h-5 text-orange-500" /> : <Sun className="w-5 h-5 text-orange-500" />}
            <div>
              <div className="font-bold text-sm">{lang === 'ar' ? 'المظهر' : 'Theme Mode'}</div>
              <div className="text-xs text-zinc-500">
                {theme === 'dark' ? (lang === 'ar' ? 'الوضع الليلي الفاخر' : 'Obsidian Dark') : lang === 'ar' ? 'الوضع النهاري' : 'Crisp Light'}
              </div>
            </div>
          </div>
          <button
            onClick={toggleTheme}
            className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:border-orange-500 text-xs font-semibold cursor-pointer"
          >
            {theme === 'dark' ? (lang === 'ar' ? 'تفعيل النهاري' : 'Switch to Light') : lang === 'ar' ? 'تفعيل الليلي' : 'Switch to Dark'}
          </button>
        </div>
      </div>

      {/* Profile, Privacy & Notifications Form */}
      <form
        onSubmit={handleSaveSettings}
        className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-zinc-100 dark:border-zinc-800/80">
          <div className="flex items-center gap-4">
            <TigerAvatar src={profile.avatarUrl} name={profile.displayName} size="lg" />
            <div>
              <div className="font-bold text-base">{profile.displayName}</div>
              <div className="text-xs text-zinc-500">{account.email}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer hover:border-orange-500">
              <Camera className="w-3.5 h-3.5 text-orange-500" />
              {lang === 'ar' ? 'صورة الحساب' : 'Avatar'}
              <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
            </label>
            <label className="px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer hover:border-orange-500">
              <User className="w-3.5 h-3.5 text-orange-500" />
              {lang === 'ar' ? 'صورة الغلاف' : 'Cover'}
              <input type="file" accept="image/*" onChange={handleCoverChange} className="hidden" />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5">{lang === 'ar' ? 'الاسم المعروض' : 'Display Name'}</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={80}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5">{lang === 'ar' ? 'المدينة / الدولة' : 'Location'}</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={100}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1.5">{lang === 'ar' ? 'النبذة التعريفية' : 'Bio'}</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={2}
            maxLength={400}
            className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
          <div>
            <label className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-orange-500" />
              {lang === 'ar' ? 'الخصوصية الافتراضية للمنشورات' : 'Default Post Privacy'}
            </label>
            <select
              value={privacyDefault}
              onChange={(e) => setPrivacyDefault(e.target.value as 'public' | 'friends' | 'private')}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm"
            >
              <option value="public">{lang === 'ar' ? 'عام — للجميع' : 'Public'}</option>
              <option value="friends">{lang === 'ar' ? 'الأصدقاء فقط' : 'Friends Only'}</option>
              <option value="private">{lang === 'ar' ? 'خاص — أنا فقط' : 'Private — Only Me'}</option>
            </select>
          </div>

          <div className="space-y-2.5">
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <Bell className="w-4 h-4 text-orange-500" />
              {lang === 'ar' ? 'تفضيلات الإشعارات' : 'Notification Preferences'}
            </div>
            <label className="flex items-center justify-between text-xs cursor-pointer">
              <span>{lang === 'ar' ? 'إشعارات الرسائل والمكالمات' : 'Messages & Calls alerts'}</span>
              <input
                type="checkbox"
                checked={notifyMessages}
                onChange={(e) => setNotifyMessages(e.target.checked)}
                className="accent-orange-500 w-4 h-4"
              />
            </label>
            <label className="flex items-center justify-between text-xs cursor-pointer">
              <span>{lang === 'ar' ? 'إشعارات التفاعل والمنشورات' : 'Social reactions & mentions'}</span>
              <input
                type="checkbox"
                checked={notifySocial}
                onChange={(e) => setNotifySocial(e.target.checked)}
                className="accent-orange-500 w-4 h-4"
              />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-zinc-500 flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-orange-500" />
            {lang === 'ar'
              ? 'تسجيل الدخول مؤمّن عبر Google Auth (إدارة كلمة المرور من حساب Google).'
              : 'Authentication is secured via Google Identity (manage password via Google Account).'}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            {saving ? '...' : lang === 'ar' ? 'حفظ التغييرات' : 'Save Settings'}
          </button>
        </div>
      </form>

      {/* Data Portability & Danger Zone */}
      <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="font-bold text-sm">{lang === 'ar' ? 'تصدير بيانات الحساب' : 'Export Account Data'}</div>
            <div className="text-xs text-zinc-500">
              {lang === 'ar'
                ? 'تنزيل ملف JSON يحتوي على ملفك الشخصي ومنشوراتك وبيانات السحابة ومحادثات AI.'
                : 'Download a JSON archive of your profile, posts, cloud metadata, and AI threads.'}
            </div>
          </div>
          <button
            onClick={handleExportData}
            disabled={exporting}
            className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-orange-500 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4 text-orange-500" />
            {exporting ? '...' : lang === 'ar' ? 'تحميل البيانات (JSON)' : 'Download JSON'}
          </button>
        </div>

        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={signOut}
            className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            {lang === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}
          </button>

          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="px-4 py-2 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              {lang === 'ar' ? 'حذف الحساب' : 'Delete Account'}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-500 font-semibold">
                {lang === 'ar' ? 'هل أنت متأكد نهائياً؟' : 'Permanently delete?'}
              </span>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="px-3.5 py-1.5 rounded-xl bg-red-600 text-white text-xs font-bold cursor-pointer"
              >
                {deleting ? '...' : lang === 'ar' ? 'نعم، احذف' : 'Confirm Delete'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs cursor-pointer"
              >
                {lang === 'ar' ? 'تراجع' : 'Cancel'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
