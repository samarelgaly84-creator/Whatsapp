import React, { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  MapPin,
  Link as LinkIcon,
  Calendar,
  Edit3,
  MessageCircle,
  Flag,
  Image as ImageIcon,
  Film,
  Cloud,
  FileText,
  CheckCircle2,
  Camera,
  X,
  ExternalLink,
  Copy,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useTiger } from '../context/TigerContext';
import { CloudFileItem, PostItem } from '../types/tiger';
import { TIGER_ASSETS } from '../lib/assets';
import { uploadPublicMedia, formatBytes } from '../lib/upload';
import { TigerAvatar } from './StatusViews';
import { SocialFeed } from './SocialFeed';

export function ProfileModule() {
  const {
    firebaseUser,
    profile: myProfile,
    profilesMap,
    selectedProfileUid,
    onlineUids,
    isAdmin,
    lang,
    pushToast,
    openDirectChatWith,
    openReportModal,
  } = useTiger();

  const targetUid = selectedProfileUid || firebaseUser?.uid || '';
  const targetProfile = targetUid === firebaseUser?.uid ? myProfile : profilesMap[targetUid];
  const isMe = targetUid === firebaseUser?.uid;

  const [tab, setTab] = useState<'posts' | 'photos' | 'videos' | 'files'>('posts');
  const [userPosts, setUserPosts] = useState<PostItem[]>([]);
  const [sharedFiles, setSharedFiles] = useState<CloudFileItem[]>([]);
  const [editing, setEditing] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [website, setWebsite] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!targetUid) return;
    const u1 = onSnapshot(
      query(collection(db, 'posts'), where('authorUid', '==', targetUid)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<PostItem, 'id'>) }))
          .filter((p) => !p.isDraft && (p.visibility !== 'private' || isMe || isAdmin));
        setUserPosts(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `posts(author=${targetUid})`)
    );

    let u2: (() => void) | null = null;
    if (isMe || isAdmin) {
      u2 = onSnapshot(
        query(collection(db, 'cloudFiles'), where('ownerUid', '==', targetUid)),
        (snap) => {
          setSharedFiles(
            snap.docs
              .map((d) => ({ id: d.id, ...(d.data() as Omit<CloudFileItem, 'id'>) }))
              .filter((f) => !f.isTrashed && f.shareAccess !== 'private')
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, `cloudFiles(owner=${targetUid})`)
      );
    } else {
      setSharedFiles([]);
    }

    return () => {
      u1();
      u2?.();
    };
  }, [targetUid, isMe, isAdmin]);

  if (!firebaseUser || !targetProfile) {
    return (
      <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-10 text-center text-sm text-zinc-500">
        {lang === 'ar' ? 'جارٍ تحميل الملف الشخصي...' : 'Loading profile...'}
      </div>
    );
  }

  const openEditor = () => {
    setDisplayName(targetProfile.displayName || '');
    setUsername(targetProfile.username || '');
    setBio(targetProfile.bio || '');
    setLocation(targetProfile.location || '');
    setWebsite(targetProfile.website || '');
    setAvatarUrl(targetProfile.avatarUrl || '');
    setCoverUrl(targetProfile.coverUrl || TIGER_ASSETS.coverStudio);
    setEditing(true);
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>, field: 'avatar' | 'cover') => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const uploaded = await uploadPublicMedia(file);
      if (field === 'avatar') setAvatarUrl(uploaded.url);
      else setCoverUrl(uploaded.url);
      pushToast(lang === 'ar' ? 'تم رفع الصورة' : 'Image uploaded', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Upload failed', 'error');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const safeHandle = username.trim().replace(/[^a-zA-Z0-9_.]/g, '_');
    if (safeHandle.length < 2) {
      pushToast(lang === 'ar' ? 'اسم المستخدم غير صالح' : 'Username must be at least 2 valid characters', 'error');
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'publicProfiles', firebaseUser.uid), {
        displayName: displayName.trim().slice(0, 80) || targetProfile.displayName,
        username: safeHandle.slice(0, 40),
        bio: bio.trim().slice(0, 400),
        location: location.trim().slice(0, 100),
        website: website.trim().slice(0, 250),
        avatarUrl,
        coverUrl,
        updatedAt: serverTimestamp(),
      });
      setEditing(false);
      pushToast(lang === 'ar' ? 'تم تحديث الملف الشخصي' : 'Profile updated', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `publicProfiles/${firebaseUser.uid}`);
    } finally {
      setSaving(false);
    }
  };

  const photos: string[] = [];
  const videos: string[] = [];
  userPosts.forEach((p) => {
    (p.mediaUrls || []).forEach((url, idx) => {
      const mime = p.mediaTypes?.[idx] || '';
      if (mime.startsWith('video/')) videos.push(url);
      else photos.push(url);
    });
  });

  const joinDate = targetProfile.createdAt?.toDate?.()
    ? targetProfile.createdAt.toDate().toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
        year: 'numeric',
        month: 'long',
      })
    : '2026';

  return (
    <div className="space-y-6">
      {/* Header Banner Card */}
      <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        <div className="h-44 sm:h-56 bg-zinc-900 relative">
          <img
            src={targetProfile.coverUrl || TIGER_ASSETS.coverStudio}
            alt={targetProfile.displayName}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        </div>

        <div className="px-6 pb-6 -mt-12 relative">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="flex items-end gap-4">
              <div className="ring-4 ring-white dark:ring-[#121216] rounded-full">
                <TigerAvatar
                  src={targetProfile.avatarUrl}
                  name={targetProfile.displayName}
                  size="xl"
                  online={onlineUids.has(targetProfile.uid)}
                />
              </div>
              <div className="pb-1">
                <h1 className="font-display text-2xl font-extrabold flex items-center gap-2">
                  <span>{targetProfile.displayName}</span>
                  {targetProfile.isVerified && <CheckCircle2 className="w-5 h-5 text-orange-500" />}
                </h1>
                <div className="text-sm text-zinc-500 dark:text-zinc-400">@{targetProfile.username}</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isMe ? (
                <button
                  onClick={openEditor}
                  className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  {lang === 'ar' ? 'تعديل الملف الشخصي' : 'Edit Profile'}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => openDirectChatWith(targetProfile.uid)}
                    className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    {lang === 'ar' ? 'مراسلة' : 'Message'}
                  </button>
                  <button
                    onClick={() =>
                      openReportModal({
                        targetType: 'user',
                        targetId: targetProfile.uid,
                        label: targetProfile.displayName,
                      })
                    }
                    className="px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:text-red-500 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    {lang === 'ar' ? 'إبلاغ' : 'Report'}
                  </button>
                </>
              )}
            </div>
          </div>

          {targetProfile.bio && (
            <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300 max-w-2xl leading-relaxed">
              {targetProfile.bio}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-zinc-500 dark:text-zinc-400">
            {targetProfile.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-orange-500" />
                {targetProfile.location}
              </span>
            )}
            {targetProfile.website && (
              <a
                href={targetProfile.website.startsWith('http') ? targetProfile.website : `https://${targetProfile.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-orange-500 hover:underline"
              >
                <LinkIcon className="w-3.5 h-3.5" />
                {targetProfile.website}
              </a>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {lang === 'ar' ? `انضم في ${joinDate}` : `Joined ${joinDate}`}
            </span>
          </div>

          <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center gap-6 text-sm tabular-nums">
            <div>
              <span className="font-bold">{targetProfile.friendsCount || 0}</span>{' '}
              <span className="text-zinc-500 dark:text-zinc-400">{lang === 'ar' ? 'أصدقاء' : 'Friends'}</span>
            </div>
            <div>
              <span className="font-bold">{targetProfile.followersCount || 0}</span>{' '}
              <span className="text-zinc-500 dark:text-zinc-400">{lang === 'ar' ? 'متابع' : 'Followers'}</span>
            </div>
            <div>
              <span className="font-bold">{userPosts.length}</span>{' '}
              <span className="text-zinc-500 dark:text-zinc-400">{lang === 'ar' ? 'منشور' : 'Posts'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveProfile}
            className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">
                {lang === 'ar' ? 'تعديل الملف الشخصي' : 'Edit Profile'}
              </h2>
              <button type="button" onClick={() => setEditing(false)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <label className="px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer hover:border-orange-500">
                <Camera className="w-4 h-4 text-orange-500" />
                {lang === 'ar' ? 'تغيير الصورة الشخصية' : 'Change Avatar'}
                <input type="file" accept="image/*" onChange={(e) => handleUploadImage(e, 'avatar')} className="hidden" />
              </label>
              <label className="px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer hover:border-orange-500">
                <ImageIcon className="w-4 h-4 text-orange-500" />
                {lang === 'ar' ? 'تغيير الغلاف' : 'Change Cover'}
                <input type="file" accept="image/*" onChange={(e) => handleUploadImage(e, 'cover')} className="hidden" />
              </label>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">{lang === 'ar' ? 'الاسم المعروض' : 'Display Name'}</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  maxLength={80}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">{lang === 'ar' ? 'اسم المستخدم (@)' : 'Username (@)'}</label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  maxLength={40}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">{lang === 'ar' ? 'النبذة التعريفية' : 'Bio'}</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  maxLength={400}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">{lang === 'ar' ? 'الموقع' : 'Location'}</label>
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    maxLength={100}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">{lang === 'ar' ? 'الموقع الإلكتروني' : 'Website'}</label>
                  <input
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    maxLength={250}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold cursor-pointer"
              >
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold cursor-pointer"
              >
                {saving ? '...' : lang === 'ar' ? 'حفظ التغييرات' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Profile Content Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
        {(
          [
            { id: 'posts', icon: FileText, ar: 'المنشورات', en: 'Posts', count: userPosts.length },
            { id: 'photos', icon: ImageIcon, ar: 'الصور', en: 'Photos', count: photos.length },
            { id: 'videos', icon: Film, ar: 'الفيديوهات', en: 'Videos', count: videos.length },
            { id: 'files', icon: Cloud, ar: 'الملفات المشاركة', en: 'Shared Files', count: sharedFiles.length },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer ${
              tab === item.id
                ? 'bg-orange-500 text-white'
                : 'bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
            }`}
          >
            <item.icon className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? item.ar : item.en}</span>
            <span className="tabular-nums opacity-80">{item.count}</span>
          </button>
        ))}
      </div>

      {tab === 'posts' && <SocialFeed authorFilterUid={targetProfile.uid} hideStories />}

      {tab === 'photos' && (
        photos.length === 0 ? (
          <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-10 text-center text-sm text-zinc-500">
            {lang === 'ar' ? 'لا توجد صور منشورة بعد.' : 'No published photos yet.'}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {photos.map((url, idx) => (
              <a
                key={`${url}-${idx}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="aspect-square rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
              >
                <img src={url} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover hover:scale-105 transition-transform" />
              </a>
            ))}
          </div>
        )
      )}

      {tab === 'videos' && (
        videos.length === 0 ? (
          <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-10 text-center text-sm text-zinc-500">
            {lang === 'ar' ? 'لا توجد فيديوهات منشورة بعد.' : 'No published videos yet.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {videos.map((url, idx) => (
              <video
                key={`${url}-${idx}`}
                src={url}
                controls
                className="w-full rounded-2xl bg-black border border-zinc-200 dark:border-zinc-800 max-h-80"
              />
            ))}
          </div>
        )
      )}

      {tab === 'files' && (
        !isMe && !isAdmin ? (
          <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-10 text-center text-sm text-zinc-500">
            {lang === 'ar'
              ? 'ملفات TIGER CLOUD معزولة بملكية خاصة؛ يمكن الوصول للملفات المشاركة عبر رابط المشاركة المباشر فقط.'
              : 'TIGER CLOUD storage is strictly owner-isolated. Shared files are accessible via direct share links.'}
          </div>
        ) : sharedFiles.length === 0 ? (
          <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-10 text-center text-sm text-zinc-500">
            {lang === 'ar'
              ? 'لم تقم بمشاركة أي ملف من TIGER CLOUD بعد.'
              : 'You have not enabled link-sharing on any TIGER CLOUD files yet.'}
          </div>
        ) : (
          <div className="space-y-2.5">
            {sharedFiles.map((file) => {
              const shareLink = `${window.location.origin}${file.downloadUrl}${file.shareToken ? `?token=${file.shareToken}` : ''}`;
              return (
                <div
                  key={file.id}
                  className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{file.name}</div>
                    <div className="text-xs text-zinc-500 tabular-nums">
                      {formatBytes(file.sizeBytes)} · {file.shareAccess === 'link_edit' ? 'Link Edit' : 'Link View'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(shareLink);
                        pushToast(lang === 'ar' ? 'تم نسخ رابط المشاركة' : 'Share link copied', 'success');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {lang === 'ar' ? 'نسخ الرابط' : 'Copy'}
                    </button>
                    <a
                      href={file.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-orange-500"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
