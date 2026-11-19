import React, { useEffect, useState, useRef } from 'react';
import {
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  increment,
} from 'firebase/firestore';
import {
  Plus,
  X,
  Eye,
  Send,
  Music,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  Sparkles,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useTiger } from '../context/TigerContext';
import { StoryItem } from '../types/tiger';
import { uploadPublicMedia, formatTimeAgo } from '../lib/upload';
import { TigerAvatar } from './StatusViews';
import { TIGER_ASSETS } from '../lib/assets';

const STICKERS = ['🐅', '🔥', '✨', '🎯', '🚀', '⚡', '📍', '💡'];
const LICENSED_TRACKS = [
  { id: 'none', label: 'No Music / بدون موسيقى', freq: 0 },
  { id: 'obsidian_pulse', label: 'Obsidian Pulse (Ambient)', freq: 220 },
  { id: 'desert_dusk', label: 'Desert Dusk (Warm Pad)', freq: 261.63 },
  { id: 'alpine_dawn', label: 'Alpine Dawn (Minimal)', freq: 293.66 },
];

interface StoryViewerRecord {
  viewerId: string;
  viewerName: string;
}

export function StoriesBar() {
  const { firebaseUser, profile, lang, t, pushToast, openDirectChatWith, notifyUser } = useTiger();
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [activeStory, setActiveStory] = useState<StoryItem | null>(null);
  const [viewers, setViewers] = useState<StoryViewerRecord[]>([]);
  const [replyText, setReplyText] = useState('');
  const [muted, setMuted] = useState(false);

  // Create story state
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string>(TIGER_ASSETS.storyPeaks);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [caption, setCaption] = useState('');
  const [sticker, setSticker] = useState('');
  const [musicTrack, setMusicTrack] = useState('none');
  const [visibility, setVisibility] = useState<'public' | 'friends' | 'private'>('public');
  const [uploading, setUploading] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onSnapshot(
      collection(db, 'stories'),
      (snap) => {
        const now = Date.now();
        const items: StoryItem[] = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<StoryItem, 'id'>) }))
          .filter((s) => s.expiresAtMs > now)
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setStories(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'stories')
    );
    return () => unsub();
  }, [firebaseUser]);

  // Ambient licensed synth playback while viewing story with musicTrack
  useEffect(() => {
    const stopAudio = () => {
      try {
        oscRef.current?.stop();
        audioCtxRef.current?.close();
      } catch {
        // ignore
      }
      oscRef.current = null;
      audioCtxRef.current = null;
    };

    if (!activeStory || !activeStory.musicTrack || activeStory.musicTrack === 'none' || muted) {
      stopAudio();
      return;
    }

    const track = LICENSED_TRACKS.find((tr) => tr.id === activeStory.musicTrack);
    if (!track || !track.freq) return;

    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = track.freq;
      gain.gain.value = 0.03;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      audioCtxRef.current = ctx;
      oscRef.current = osc;
    } catch {
      // autoplay blocked until interaction
    }

    return stopAudio;
  }, [activeStory, muted]);

  // Log view and load viewers when opening a story
  useEffect(() => {
    if (!activeStory || !firebaseUser || !profile) {
      setViewers([]);
      return;
    }

    const viewRef = doc(db, 'stories', activeStory.id, 'views', firebaseUser.uid);
    if (activeStory.authorUid !== firebaseUser.uid) {
      setDoc(viewRef, {
        viewerId: firebaseUser.uid,
        viewerName: profile.displayName,
        viewedAt: serverTimestamp(),
      })
        .then(() => {
          updateDoc(doc(db, 'stories', activeStory.id), {
            viewersCount: increment(1),
          }).catch(() => {});
        })
        .catch(() => {});
    }

    const unsub = onSnapshot(
      collection(db, 'stories', activeStory.id, 'views'),
      (snap) => {
        setViewers(snap.docs.map((d) => d.data() as StoryViewerRecord));
      },
      () => {}
    );
    return () => unsub();
  }, [activeStory, firebaseUser, profile]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaFile(file);
    setMediaType(file.type.startsWith('video/') ? 'video' : 'image');
    setMediaPreview(URL.createObjectURL(file));
  };

  const handlePublishStory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !profile) return;
    setUploading(true);
    try {
      let mediaUrl = mediaPreview;
      if (mediaFile) {
        const uploaded = await uploadPublicMedia(mediaFile);
        mediaUrl = uploaded.url;
      }

      const expiresAtMs = Date.now() + 24 * 60 * 60 * 1000;
      await addDoc(collection(db, 'stories'), {
        authorUid: firebaseUser.uid,
        authorName: profile.displayName,
        authorAvatar: profile.avatarUrl || TIGER_ASSETS.logo,
        mediaUrl,
        mediaType,
        caption: caption.trim().slice(0, 380),
        sticker,
        musicTrack,
        visibility,
        viewersCount: 0,
        expiresAtMs,
        createdAt: serverTimestamp(),
      });

      pushToast(lang === 'ar' ? 'تم نشر قصتك لمدة 24 ساعة' : 'Story published for 24 hours', 'success');
      setShowCreate(false);
      setMediaFile(null);
      setMediaPreview(TIGER_ASSETS.storyPeaks);
      setCaption('');
      setSticker('');
      setMusicTrack('none');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Story publish failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleReplyToStory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStory || !replyText.trim() || !firebaseUser) return;
    await notifyUser({
      recipientUid: activeStory.authorUid,
      type: 'message',
      targetId: activeStory.id,
      message: `${lang === 'ar' ? 'رد على قصتك:' : 'Replied to your story:'} ${replyText.trim()}`,
    });
    setReplyText('');
    pushToast(lang === 'ar' ? 'تم إرسال الرد على القصة' : 'Story reply sent', 'success');
    await openDirectChatWith(activeStory.authorUid);
    setActiveStory(null);
  };

  const handleDeleteStory = async (story: StoryItem) => {
    try {
      await deleteDoc(doc(db, 'stories', story.id));
      setActiveStory(null);
      pushToast(lang === 'ar' ? 'تم حذف القصة' : 'Story deleted', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `stories/${story.id}`);
    }
  };

  return (
    <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-orange-500" />
          <span>{t.feed.stories}</span>
        </h2>
        <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
          {stories.length} {lang === 'ar' ? 'قصة نشطة' : 'active'}
        </span>
      </div>

      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        {/* Add Story Card */}
        <button
          onClick={() => setShowCreate(true)}
          className="shrink-0 w-24 h-36 rounded-xl border border-dashed border-orange-500/60 bg-orange-500/5 hover:bg-orange-500/10 flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <div className="w-9 h-9 rounded-full bg-orange-500 text-white flex items-center justify-center">
            <Plus className="w-5 h-5" />
          </div>
          <span className="text-xs font-semibold text-orange-500 px-1 text-center">
            {t.feed.addStory}
          </span>
        </button>

        {stories.map((story) => (
          <button
            key={story.id}
            onClick={() => setActiveStory(story)}
            className="shrink-0 relative w-24 h-36 rounded-xl overflow-hidden border-2 border-orange-500 group cursor-pointer bg-zinc-900"
          >
            {story.mediaType === 'video' ? (
              <video
                src={story.mediaUrl}
                muted
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
            ) : (
              <img
                src={story.mediaUrl}
                alt={story.authorName}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent flex flex-col justify-between p-2">
              <div className="flex justify-start">
                <TigerAvatar src={story.authorAvatar} name={story.authorName} size="xs" />
              </div>
              <div className="text-start">
                <div className="text-[11px] font-semibold text-white truncate">
                  {story.authorName}
                </div>
              </div>
            </div>
          </button>
        ))}

        {stories.length === 0 && (
          <div className="text-xs text-zinc-500 dark:text-zinc-400 px-3">
            {lang === 'ar'
              ? 'شارك أول قصة يومية تختفي تلقائياً بعد 24 ساعة.'
              : 'Share the first 24-hour story with photos, video, stickers, or audio.'}
          </div>
        )}
      </div>

      {/* Create Story Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">{t.feed.addStory}</h3>
              <button
                onClick={() => setShowCreate(false)}
                className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handlePublishStory} className="space-y-4">
              <div className="relative h-64 rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800">
                {mediaType === 'video' ? (
                  <video src={mediaPreview} controls className="w-full h-full object-cover" />
                ) : (
                  <img
                    src={mediaPreview}
                    alt="Story preview"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                )}
                {sticker && (
                  <div className="absolute top-4 end-4 text-4xl select-none">{sticker}</div>
                )}
                {caption && (
                  <div className="absolute bottom-3 inset-x-3 bg-black/70 backdrop-blur-sm text-white text-xs p-2.5 rounded-lg text-center">
                    {caption}
                  </div>
                )}
              </div>

              <label className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold cursor-pointer">
                <Upload className="w-4 h-4 text-orange-500" />
                <span>
                  {lang === 'ar' ? 'رفع صورة أو فيديو من الجهاز' : 'Upload Photo or Video'}
                </span>
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>

              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={380}
                placeholder={lang === 'ar' ? 'أضف نصاً على القصة...' : 'Add caption text...'}
                className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3.5 py-2.5 text-sm focus:outline-none focus:border-orange-500"
              />

              <div className="space-y-1.5">
                <div className="text-xs font-medium text-zinc-500">
                  {lang === 'ar' ? 'ملصق (اختياري)' : 'Sticker (optional)'}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSticker('')}
                    className={`px-2.5 py-1 rounded-lg text-xs border cursor-pointer ${
                      sticker === ''
                        ? 'border-orange-500 text-orange-500'
                        : 'border-zinc-200 dark:border-zinc-800'
                    }`}
                  >
                    {lang === 'ar' ? 'بدون' : 'None'}
                  </button>
                  {STICKERS.map((s) => (
                    <button
                      type="button"
                      key={s}
                      onClick={() => setSticker(s)}
                      className={`px-2.5 py-1 rounded-lg text-base border cursor-pointer ${
                        sticker === s
                          ? 'border-orange-500 bg-orange-500/10'
                          : 'border-zinc-200 dark:border-zinc-800'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={musicTrack}
                  onChange={(e) => setMusicTrack(e.target.value)}
                  className="rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs"
                >
                  {LICENSED_TRACKS.map((tr) => (
                    <option key={tr.id} value={tr.id}>
                      {tr.label}
                    </option>
                  ))}
                </select>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as 'public' | 'friends' | 'private')}
                  className="rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs"
                >
                  <option value="public">{t.common.public}</option>
                  <option value="friends">{t.common.friendsOnly}</option>
                  <option value="private">{t.common.private}</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm cursor-pointer"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold cursor-pointer"
                >
                  {uploading ? t.common.loading : t.common.publish}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full-Screen Story Viewer */}
      {activeStory && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative w-full max-w-md h-[82vh] rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800 flex flex-col">
            <div className="absolute top-3 inset-x-3 z-20 flex items-center justify-between gap-2 bg-black/55 backdrop-blur-md px-3 py-2 rounded-xl">
              <div className="flex items-center gap-2.5 min-w-0">
                <TigerAvatar src={activeStory.authorAvatar} name={activeStory.authorName} size="xs" />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">
                    {activeStory.authorName}
                  </div>
                  <div className="text-[11px] text-zinc-300">
                    {formatTimeAgo(activeStory.createdAt?.toMillis?.(), lang)}
                    {activeStory.musicTrack && activeStory.musicTrack !== 'none' && (
                      <span className="inline-flex items-center gap-1 ms-2 text-orange-400">
                        <Music className="w-3 h-3" /> {activeStory.musicTrack}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {activeStory.musicTrack && activeStory.musicTrack !== 'none' && (
                  <button
                    onClick={() => setMuted((m) => !m)}
                    className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 cursor-pointer"
                  >
                    {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                )}
                {activeStory.authorUid === firebaseUser?.uid && (
                  <button
                    onClick={() => handleDeleteStory(activeStory)}
                    className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setActiveStory(null)}
                  className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 relative">
              {activeStory.mediaType === 'video' ? (
                <video
                  src={activeStory.mediaUrl}
                  autoPlay
                  loop
                  playsInline
                  muted={muted}
                  className="w-full h-full object-cover"
                />
              ) : (
                <img
                  src={activeStory.mediaUrl}
                  alt={activeStory.authorName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              )}
              {activeStory.sticker && (
                <div className="absolute top-20 end-5 text-5xl">{activeStory.sticker}</div>
              )}
              {activeStory.caption && (
                <div className="absolute bottom-4 inset-x-4 bg-black/75 backdrop-blur-sm text-white text-sm p-3 rounded-xl text-center">
                  {activeStory.caption}
                </div>
              )}
            </div>

            <div className="p-3 bg-zinc-950 border-t border-zinc-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <Eye className="w-3.5 h-3.5 text-orange-500" />
                  {viewers.length} {lang === 'ar' ? 'مشاهد' : 'viewers'}
                </span>
                {viewers.length > 0 && (
                  <span className="truncate max-w-[200px]">
                    {viewers.map((v) => v.viewerName).join(' · ')}
                  </span>
                )}
              </div>
              {activeStory.authorUid !== firebaseUser?.uid && (
                <form onSubmit={handleReplyToStory} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={lang === 'ar' ? 'أرسل رداً على القصة...' : 'Reply to story...'}
                    className="flex-1 rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                  <button
                    type="submit"
                    className="p-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
