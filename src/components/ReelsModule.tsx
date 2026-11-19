import React, { useEffect, useState } from 'react';
import {
  collection,
  addDoc,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  increment,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  Heart,
  Share2,
  Eye,
  Plus,
  ChevronUp,
  ChevronDown,
  Music,
  Volume2,
  VolumeX,
  Upload,
  X,
  UserPlus,
  Trash2,
  Flag,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useTiger } from '../context/TigerContext';
import { ReelItem } from '../types/tiger';
import { uploadPublicMedia } from '../lib/upload';
import { TigerAvatar } from './StatusViews';
import { TIGER_ASSETS } from '../lib/assets';

export function ReelsModule() {
  const { firebaseUser, profile, lang, t, pushToast, openUserProfile, openReportModal, notifyUser } = useTiger();
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  // Upload state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [hashtagsText, setHashtagsText] = useState('');
  const [musicTitle, setMusicTitle] = useState('Original Audio · TIGER');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onSnapshot(
      collection(db, 'reels'),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<ReelItem, 'id'>) }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setReels(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'reels')
    );
    return () => unsub();
  }, [firebaseUser]);

  const currentReel = reels[activeIndex] || null;

  useEffect(() => {
    if (!currentReel) return;
    updateDoc(doc(db, 'reels', currentReel.id), { viewsCount: increment(1) }).catch(() => {});
  }, [currentReel?.id]);

  const handleUploadReel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !profile || !videoFile) {
      pushToast(lang === 'ar' ? 'اختر ملف فيديو أولاً' : 'Please select a video file first', 'error');
      return;
    }
    setUploading(true);
    try {
      const uploaded = await uploadPublicMedia(videoFile);
      const hashtags = hashtagsText
        .split(/[\s,#]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12);

      await addDoc(collection(db, 'reels'), {
        authorUid: firebaseUser.uid,
        authorName: profile.displayName,
        authorAvatar: profile.avatarUrl || TIGER_ASSETS.logo,
        videoUrl: uploaded.url,
        thumbnailUrl: TIGER_ASSETS.reelCity,
        caption: caption.trim().slice(0, 480),
        hashtags,
        musicTitle: musicTitle.trim().slice(0, 110),
        likesCount: 0,
        commentsCount: 0,
        viewsCount: 1,
        sharesCount: 0,
        createdAt: serverTimestamp(),
      });

      setShowUpload(false);
      setVideoFile(null);
      setCaption('');
      setHashtagsText('');
      setActiveIndex(0);
      pushToast(lang === 'ar' ? 'تم نشر الريل بنجاح' : 'Reel published!', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Reel upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleLike = async (reel: ReelItem) => {
    await updateDoc(doc(db, 'reels', reel.id), { likesCount: increment(1) });
    await notifyUser({
      recipientUid: reel.authorUid,
      type: 'like',
      targetId: reel.id,
      message: lang === 'ar' ? 'أُعجب بفيديو الريل الخاص بك' : 'liked your Reel',
    });
  };

  const handleFollow = async (targetUid: string) => {
    if (!firebaseUser || targetUid === firebaseUser.uid) return;
    await setDoc(doc(db, 'follows', `${firebaseUser.uid}_${targetUid}`), {
      followerUid: firebaseUser.uid,
      targetUid,
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'publicProfiles', targetUid), {
      followersCount: increment(1),
      updatedAt: serverTimestamp(),
    }).catch(() => {});
    pushToast(lang === 'ar' ? 'تمت المتابعة بنجاح' : 'Now following creator', 'success');
  };

  const handleShare = async (reel: ReelItem) => {
    await updateDoc(doc(db, 'reels', reel.id), { sharesCount: increment(1) });
    navigator.clipboard.writeText(`${window.location.origin}/?reel=${reel.id}`).catch(() => {});
    pushToast(t.common.copied, 'success');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold">TIGER REELS</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {lang === 'ar'
              ? 'فيديوهات عمودية قصيرة بتشغيل تلقائي وسحب سلس.'
              : 'Vertical short-form videos with autoplay and instant discovery.'}
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          {lang === 'ar' ? 'رفع فيديو ريل' : 'Upload Reel'}
        </button>
      </div>

      {!currentReel ? (
        <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 flex flex-col md:flex-row items-center gap-8">
          <img
            src={TIGER_ASSETS.reelCity}
            alt="TIGER Reels Stage"
            referrerPolicy="no-referrer"
            className="w-56 h-80 object-cover rounded-2xl border border-zinc-800 shrink-0"
          />
          <div className="space-y-4 text-center md:text-start">
            <h2 className="text-xl font-bold">
              {lang === 'ar' ? 'ابدأ أول فيديو ريل على TIGER' : 'Publish the First TIGER Reel'}
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-md">
              {lang === 'ar'
                ? 'ارفع فيديو عمودي مباشرة من جهازك مع وصف وهاشتاجات ليظهر لجميع المستخدمين مع عداد المشاهدات والتفاعلات.'
                : 'Upload a vertical video straight from your device with captions and hashtags for instant autoplay playback.'}
            </p>
            <button
              onClick={() => setShowUpload(true)}
              className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold inline-flex items-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              {lang === 'ar' ? 'رفع أول فيديو' : 'Upload First Video'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row items-center justify-center gap-6">
          {/* Vertical 9:16 Stage */}
          <div className="relative w-full max-w-[380px] h-[74vh] min-h-[520px] rounded-2xl overflow-hidden bg-black border border-zinc-800">
            <video
              key={currentReel.id}
              src={currentReel.videoUrl}
              poster={currentReel.thumbnailUrl || TIGER_ASSETS.reelCity}
              autoPlay
              loop
              playsInline
              muted={muted}
              controls={false}
              onClick={() => setMuted((m) => !m)}
              className="w-full h-full object-cover cursor-pointer"
            />

            <div className="absolute top-3 end-3 flex items-center gap-2">
              <button
                onClick={() => setMuted((m) => !m)}
                className="p-2 rounded-full bg-black/60 text-white hover:bg-black/80 cursor-pointer"
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              {currentReel.authorUid === firebaseUser?.uid && (
                <button
                  onClick={async () => {
                    await deleteDoc(doc(db, 'reels', currentReel.id));
                    setActiveIndex(0);
                    pushToast(lang === 'ar' ? 'تم حذف الريل' : 'Reel deleted', 'info');
                  }}
                  className="p-2 rounded-full bg-black/60 text-red-400 hover:bg-red-600 hover:text-white cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Bottom Overlay */}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent p-4 flex items-end justify-between gap-3">
              <div className="space-y-2 min-w-0 text-white flex-1">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openUserProfile(currentReel.authorUid)}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <TigerAvatar
                      src={currentReel.authorAvatar}
                      name={currentReel.authorName}
                      size="xs"
                    />
                    <span className="text-sm font-bold truncate">{currentReel.authorName}</span>
                  </button>
                  {currentReel.authorUid !== firebaseUser?.uid && (
                    <button
                      onClick={() => handleFollow(currentReel.authorUid)}
                      className="px-2.5 py-1 rounded-lg bg-orange-500 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <UserPlus className="w-3 h-3" /> {lang === 'ar' ? 'متابعة' : 'Follow'}
                    </button>
                  )}
                </div>
                <p className="text-xs text-zinc-200 line-clamp-3">{currentReel.caption}</p>
                {currentReel.hashtags && currentReel.hashtags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 text-[11px] text-orange-400 font-semibold">
                    {currentReel.hashtags.map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                )}
                {currentReel.musicTitle && (
                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-300">
                    <Music className="w-3 h-3 text-orange-400" />
                    <span className="truncate">{currentReel.musicTitle}</span>
                  </div>
                )}
              </div>

              {/* Action Rail */}
              <div className="flex flex-col items-center gap-4 text-white shrink-0">
                <button
                  onClick={() => handleLike(currentReel)}
                  className="flex flex-col items-center gap-1 cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-full bg-white/15 group-hover:bg-orange-500 flex items-center justify-center transition-colors">
                    <Heart className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-mono tabular-nums">
                    {currentReel.likesCount || 0}
                  </span>
                </button>
                <div className="flex flex-col items-center gap-1">
                  <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center">
                    <Eye className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-mono tabular-nums">
                    {currentReel.viewsCount || 1}
                  </span>
                </div>
                <button
                  onClick={() => handleShare(currentReel)}
                  className="flex flex-col items-center gap-1 cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-white/15 hover:bg-orange-500 flex items-center justify-center transition-colors">
                    <Share2 className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-mono tabular-nums">
                    {currentReel.sharesCount || 0}
                  </span>
                </button>
                <button
                  onClick={() =>
                    openReportModal({
                      targetType: 'post',
                      targetId: currentReel.id,
                      label: `Reel by ${currentReel.authorName}`,
                    })
                  }
                  className="p-2 rounded-full bg-white/10 hover:bg-red-500/80 cursor-pointer"
                >
                  <Flag className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Swipe / Prev-Next Navigation & Queue */}
          <div className="flex lg:flex-col items-center gap-3">
            <button
              onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
              disabled={activeIndex === 0}
              className="p-3 rounded-xl bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 disabled:opacity-35 hover:border-orange-500 cursor-pointer"
            >
              <ChevronUp className="w-5 h-5" />
            </button>
            <div className="text-xs font-mono tabular-nums text-zinc-500">
              {activeIndex + 1} / {reels.length}
            </div>
            <button
              onClick={() => setActiveIndex((i) => Math.min(reels.length - 1, i + 1))}
              disabled={activeIndex >= reels.length - 1}
              className="p-3 rounded-xl bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 disabled:opacity-35 hover:border-orange-500 cursor-pointer"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Upload Reel Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">{lang === 'ar' ? 'رفع فيديو ريل جديد' : 'Upload New Reel'}</h3>
              <button onClick={() => setShowUpload(false)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUploadReel} className="space-y-3.5">
              <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border border-dashed border-orange-500/60 bg-orange-500/5 hover:bg-orange-500/10 cursor-pointer text-center">
                <Upload className="w-6 h-6 text-orange-500" />
                <span className="text-xs font-semibold">
                  {videoFile
                    ? videoFile.name
                    : lang === 'ar'
                    ? 'اختر فيديو MP4 / WebM من جهازك'
                    : 'Choose MP4 / WebM video from device'}
                </span>
                <input
                  type="file"
                  accept="video/*"
                  required
                  onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>

              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={3}
                required
                placeholder={lang === 'ar' ? 'وصف الفيديو...' : 'Video caption...'}
                className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3 text-sm focus:outline-none focus:border-orange-500"
              />

              <input
                type="text"
                value={hashtagsText}
                onChange={(e) => setHashtagsText(e.target.value)}
                placeholder="#tiger #design #tech"
                className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs focus:outline-none focus:border-orange-500"
              />

              <input
                type="text"
                value={musicTitle}
                onChange={(e) => setMusicTitle(e.target.value)}
                placeholder={lang === 'ar' ? 'اسم الصوت / الموسيقى' : 'Audio track name'}
                className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs focus:outline-none focus:border-orange-500"
              />

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUpload(false)}
                  className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs cursor-pointer"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={uploading || !videoFile}
                  className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                >
                  {uploading ? t.common.loading : t.common.publish}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
