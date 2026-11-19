import React, { useEffect, useState } from 'react';
import {
  collection,
  addDoc,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  serverTimestamp,
  increment,
  query,
  where,
} from 'firebase/firestore';
import {
  Image as ImageIcon,
  FileText,
  BarChart3,
  Link2,
  MapPin,
  Palette,
  Send,
  Bookmark,
  Share2,
  MessageCircle,
  Pin,
  Trash2,
  Edit3,
  Eye,
  Lock,
  Globe,
  Users,
  Flag,
  Check,
  X,
  Plus,
  Copy,
  MessageSquareOff,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useTiger } from '../context/TigerContext';
import { CommentItem, PollOption, PostItem, ReactionType } from '../types/tiger';
import { uploadPublicMedia, formatTimeAgo } from '../lib/upload';
import { TigerAvatar } from './StatusViews';
import { StoriesBar } from './StoriesBar';
import { TIGER_ASSETS } from '../lib/assets';

const REACTIONS: Array<{ type: ReactionType; emoji: string; labelAr: string; labelEn: string }> = [
  { type: 'like', emoji: '👍', labelAr: 'إعجاب', labelEn: 'Like' },
  { type: 'love', emoji: '❤️', labelAr: 'أحببته', labelEn: 'Love' },
  { type: 'haha', emoji: '😂', labelAr: 'مضحك', labelEn: 'Haha' },
  { type: 'wow', emoji: '😮', labelAr: 'مدهش', labelEn: 'Wow' },
  { type: 'sad', emoji: '😢', labelAr: 'حزين', labelEn: 'Sad' },
  { type: 'angry', emoji: '😡', labelAr: 'غاضب', labelEn: 'Angry' },
];

const BACKDROPS = [
  { id: '', label: 'Default', className: '' },
  {
    id: 'tiger-obsidian',
    label: 'Obsidian',
    className: 'bg-gradient-to-br from-zinc-950 via-zinc-900 to-orange-950 text-white',
  },
  {
    id: 'tiger-ember',
    label: 'Ember',
    className: 'bg-gradient-to-br from-orange-600 via-orange-500 to-amber-600 text-white',
  },
  {
    id: 'tiger-slate',
    label: 'Slate',
    className: 'bg-gradient-to-br from-slate-900 via-zinc-800 to-slate-900 text-white',
  },
];

export function SocialFeed({
  groupId,
  pageId,
  authorFilterUid,
  hideStories,
}: {
  groupId?: string;
  pageId?: string;
  authorFilterUid?: string;
  hideStories?: boolean;
}) {
  const {
    firebaseUser,
    profile,
    profilesMap,
    lang,
    t,
    globalSearch,
    pushToast,
    openReportModal,
    openUserProfile,
    notifyUser,
  } = useTiger();

  const [posts, setPosts] = useState<PostItem[]>([]);
  const [savedPostIds, setSavedPostIds] = useState<Set<string>>(new Set());
  const [friendUids, setFriendUids] = useState<Set<string>>(new Set());
  const [feedFilter, setFeedFilter] = useState<'all' | 'friends' | 'saved' | 'drafts'>('all');
  const [sortMode, setSortMode] = useState<'latest' | 'top'>('latest');
  const [activeHashtag, setActiveHashtag] = useState<string>('');

  // Composer state
  const [content, setContent] = useState('');
  const [backgroundStyle, setBackgroundStyle] = useState('');
  const [mediaFiles, setMediaFiles] = useState<Array<{ url: string; type: string; name: string }>>([]);
  const [pdfAttachment, setPdfAttachment] = useState<{ name: string; url: string } | null>(null);
  const [externalLink, setExternalLink] = useState('');
  const [location, setLocation] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'friends' | 'private'>('public');
  const [showPoll, setShowPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollChoices, setPollChoices] = useState<string[]>(['', '']);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [showLocationInput, setShowLocationInput] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Per-post interactive states
  const [openCommentsPostId, setOpenCommentsPostId] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onSnapshot(
      collection(db, 'posts'),
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PostItem, 'id'>),
        }));
        setPosts(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'posts')
    );

    const savedQuery = query(
      collection(db, 'savedPosts'),
      where('userId', '==', firebaseUser.uid)
    );
    const unsubSaved = onSnapshot(
      savedQuery,
      (snap) => {
        setSavedPostIds(new Set(snap.docs.map((d) => String(d.data().postId))));
      },
      () => {}
    );

    const unsubFriendsA = onSnapshot(
      query(collection(db, 'friendships'), where('uidA', '==', firebaseUser.uid)),
      (snap) => {
        setFriendUids((prev) => {
          const next = new Set(prev);
          snap.docs.forEach((d) => next.add(String(d.data().uidB)));
          return next;
        });
      },
      () => {}
    );
    const unsubFriendsB = onSnapshot(
      query(collection(db, 'friendships'), where('uidB', '==', firebaseUser.uid)),
      (snap) => {
        setFriendUids((prev) => {
          const next = new Set(prev);
          snap.docs.forEach((d) => next.add(String(d.data().uidA)));
          return next;
        });
      },
      () => {}
    );

    return () => {
      unsub();
      unsubSaved();
      unsubFriendsA();
      unsubFriendsB();
    };
  }, [firebaseUser]);

  const handleUploadMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const uploadedItems: Array<{ url: string; type: string; name: string }> = [];
      for (const f of files.slice(0, 6)) {
        const res = await uploadPublicMedia(f);
        if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
          setPdfAttachment({ name: f.name, url: res.url });
        } else {
          uploadedItems.push({
            url: res.url,
            type: f.type.startsWith('video/') ? 'video' : 'image',
            name: f.name,
          });
        }
      }
      if (uploadedItems.length > 0) {
        setMediaFiles((prev) => [...prev, ...uploadedItems].slice(0, 8));
      }
      pushToast(lang === 'ar' ? 'تم رفع الوسائط بنجاح' : 'Media uploaded', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const extractHashtags = (text: string): string[] => {
    const matches = text.match(/#[\p{L}\p{N}_]+/gu) || [];
    return Array.from(new Set(matches.map((m) => m.slice(1)))).slice(0, 12);
  };

  const handlePublish = async (asDraft: boolean) => {
    if (!firebaseUser || !profile) return;
    if (!content.trim() && mediaFiles.length === 0 && !pdfAttachment && !pollQuestion.trim()) {
      pushToast(lang === 'ar' ? 'أضف نصاً أو وسائط أولاً' : 'Add text or media first', 'error');
      return;
    }

    setPublishing(true);
    try {
      const hashtags = extractHashtags(content);
      const validPollOptions: PollOption[] = showPoll && pollQuestion.trim()
        ? pollChoices
            .map((c) => c.trim())
            .filter(Boolean)
            .slice(0, 6)
            .map((label) => ({ label, votes: 0, voterUids: [] }))
        : [];

      const payload: Record<string, unknown> = {
        authorUid: firebaseUser.uid,
        authorName: profile.displayName,
        authorAvatar: profile.avatarUrl || TIGER_ASSETS.logo,
        content: content.trim().slice(0, 4900),
        backgroundStyle,
        mediaUrls: mediaFiles.map((m) => m.url),
        mediaTypes: mediaFiles.map((m) => m.type),
        externalLink: externalLink.trim().slice(0, 480),
        pdfName: pdfAttachment?.name || '',
        pdfUrl: pdfAttachment?.url || '',
        pollQuestion: showPoll ? pollQuestion.trim().slice(0, 220) : '',
        pollOptions: validPollOptions,
        hashtags,
        location: location.trim().slice(0, 110),
        visibility,
        isDraft: asDraft,
        isPinned: false,
        commentsDisabled: false,
        groupId: groupId || '',
        pageId: pageId || '',
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        viewsCount: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const ref = await addDoc(collection(db, 'posts'), payload);

      // Notify mentioned @usernames
      const mentions = content.match(/@([a-zA-Z0-9_.]+)/g) || [];
      for (const m of mentions) {
        const uname = m.slice(1).toLowerCase();
        const target = Object.values(profilesMap).find((p) => p.username.toLowerCase() === uname);
        if (target && target.uid !== firebaseUser.uid) {
          await notifyUser({
            recipientUid: target.uid,
            type: 'mention',
            targetId: ref.id,
            message: lang === 'ar' ? 'أشار إليك في منشور جديد' : 'mentioned you in a post',
          });
        }
      }

      setContent('');
      setBackgroundStyle('');
      setMediaFiles([]);
      setPdfAttachment(null);
      setExternalLink('');
      setLocation('');
      setShowPoll(false);
      setPollQuestion('');
      setPollChoices(['', '']);
      setShowPreview(false);
      pushToast(
        asDraft
          ? lang === 'ar'
            ? 'تم حفظ المسودة'
            : 'Draft saved'
          : lang === 'ar'
          ? 'تم نشر منشورك بنجاح'
          : 'Post published!',
        'success'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'posts');
    } finally {
      setPublishing(false);
    }
  };

  const handleToggleSave = async (post: PostItem) => {
    if (!firebaseUser) return;
    const saveId = `${firebaseUser.uid}_${post.id}`;
    const ref = doc(db, 'savedPosts', saveId);
    try {
      if (savedPostIds.has(post.id)) {
        await deleteDoc(ref);
        pushToast(lang === 'ar' ? 'تمت الإزالة من المحفوظات' : 'Removed from saved', 'info');
      } else {
        await setDoc(ref, {
          userId: firebaseUser.uid,
          postId: post.id,
          createdAt: serverTimestamp(),
        });
        pushToast(lang === 'ar' ? 'تم حفظ المنشور' : 'Post saved', 'success');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `savedPosts/${saveId}`);
    }
  };

  const handleVotePoll = async (post: PostItem, optionIdx: number) => {
    if (!firebaseUser || !post.pollOptions) return;
    const updated = post.pollOptions.map((opt, idx) => {
      const voters = (opt.voterUids || []).filter((u) => u !== firebaseUser.uid);
      if (idx === optionIdx) voters.push(firebaseUser.uid);
      return { ...opt, voterUids: voters, votes: voters.length };
    });
    try {
      await updateDoc(doc(db, 'posts', post.id), { pollOptions: updated });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `posts/${post.id}`);
    }
  };

  const handleSharePost = async (post: PostItem) => {
    try {
      await updateDoc(doc(db, 'posts', post.id), { sharesCount: increment(1) });
      const url = `${window.location.origin}/?post=${post.id}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      pushToast(lang === 'ar' ? 'تم نسخ رابط المنشور ومشاركته' : 'Post link copied & shared', 'success');
      await notifyUser({
        recipientUid: post.authorUid,
        type: 'share',
        targetId: post.id,
        message: lang === 'ar' ? 'شارك منشورك' : 'shared your post',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `posts/${post.id}`);
    }
  };

  const handleSaveEdit = async (postId: string) => {
    if (!editingText.trim()) return;
    try {
      await updateDoc(doc(db, 'posts', postId), {
        content: editingText.trim().slice(0, 4900),
        hashtags: extractHashtags(editingText),
        updatedAt: serverTimestamp(),
      });
      setEditingPostId(null);
      pushToast(lang === 'ar' ? 'تم تعديل المنشور' : 'Post updated', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `posts/${postId}`);
    }
  };

  // Filter & sort feed
  const filteredPosts = posts
    .filter((p) => {
      if (groupId && p.groupId !== groupId) return false;
      if (pageId && p.pageId !== pageId) return false;
      if (authorFilterUid && p.authorUid !== authorFilterUid) return false;

      if (feedFilter === 'drafts') {
        return p.isDraft && p.authorUid === firebaseUser?.uid;
      }
      if (p.isDraft) return false;
      if (feedFilter === 'friends' && p.authorUid !== firebaseUser?.uid && !friendUids.has(p.authorUid)) {
        return false;
      }
      if (feedFilter === 'saved' && !savedPostIds.has(p.id)) return false;

      if (activeHashtag && !(p.hashtags || []).includes(activeHashtag)) return false;

      if (globalSearch.trim()) {
        const q = globalSearch.toLowerCase();
        const hay = `${p.content} ${p.authorName} ${(p.hashtags || []).join(' ')} ${p.location || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      if (sortMode === 'top') {
        const scoreA = (a.likesCount || 0) * 2 + (a.commentsCount || 0) * 3 + (a.sharesCount || 0) * 4;
        const scoreB = (b.likesCount || 0) * 2 + (b.commentsCount || 0) * 3 + (b.sharesCount || 0) * 4;
        return scoreB - scoreA;
      }
      return (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0);
    });

  return (
    <div className="space-y-5">
      {!hideStories && <StoriesBar />}

      {/* Rich Post Composer */}
      {(!authorFilterUid || authorFilterUid === firebaseUser?.uid) && (
        <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex items-start gap-3">
            <TigerAvatar
              src={profile?.avatarUrl}
              name={profile?.displayName || 'TIGER'}
              size="md"
              online
            />
            <div className="flex-1 space-y-3">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={3}
                maxLength={4900}
                placeholder={t.feed.whatsNew}
                className={`w-full rounded-xl p-3.5 text-sm resize-none focus:outline-none border transition-colors ${
                  backgroundStyle
                    ? `${BACKDROPS.find((b) => b.id === backgroundStyle)?.className || ''} border-transparent placeholder:text-white/70 font-semibold text-base min-h-[120px]`
                    : 'bg-zinc-50 dark:bg-zinc-900/70 border-zinc-200 dark:border-zinc-800 focus:border-orange-500'
                }`}
              />

              {/* Uploaded Media Preview Grid */}
              {mediaFiles.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {mediaFiles.map((m, idx) => (
                    <div key={`${m.url}-${idx}`} className="relative rounded-xl overflow-hidden h-28 bg-zinc-900">
                      {m.type === 'video' ? (
                        <video src={m.url} className="w-full h-full object-cover" />
                      ) : (
                        <img
                          src={m.url}
                          alt={m.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => setMediaFiles((prev) => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1.5 end-1.5 p-1 rounded-full bg-black/75 text-white hover:bg-red-500 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Attached PDF Preview */}
              {pdfAttachment && (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-xs">
                  <div className="flex items-center gap-2 font-medium truncate">
                    <FileText className="w-4 h-4 text-orange-500 shrink-0" />
                    <span className="truncate">{pdfAttachment.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPdfAttachment(null)}
                    className="p-1 hover:text-red-500 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Optional Inputs */}
              {showBgPicker && (
                <div className="flex flex-wrap items-center gap-2">
                  {BACKDROPS.map((bg) => (
                    <button
                      type="button"
                      key={bg.id || 'none'}
                      onClick={() => setBackgroundStyle(bg.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                        backgroundStyle === bg.id
                          ? 'border-orange-500 text-orange-500'
                          : 'border-zinc-200 dark:border-zinc-800'
                      }`}
                    >
                      {bg.label}
                    </button>
                  ))}
                </div>
              )}

              {showLinkInput && (
                <input
                  type="url"
                  value={externalLink}
                  onChange={(e) => setExternalLink(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs focus:outline-none focus:border-orange-500"
                />
              )}

              {showLocationInput && (
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={lang === 'ar' ? 'المدينة أو الموقع الجغرافي...' : 'City or place...'}
                  className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs focus:outline-none focus:border-orange-500"
                />
              )}

              {showPoll && (
                <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 space-y-2.5">
                  <input
                    type="text"
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    placeholder={lang === 'ar' ? 'سؤال الاستطلاع...' : 'Poll question...'}
                    className="w-full rounded-lg bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs font-semibold focus:outline-none focus:border-orange-500"
                  />
                  {pollChoices.map((choice, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={choice}
                        onChange={(e) => {
                          const next = [...pollChoices];
                          next[i] = e.target.value;
                          setPollChoices(next);
                        }}
                        placeholder={`${lang === 'ar' ? 'خيار' : 'Option'} ${i + 1}`}
                        className="flex-1 rounded-lg bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-xs focus:outline-none focus:border-orange-500"
                      />
                      {pollChoices.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setPollChoices((prev) => prev.filter((_, idx) => idx !== i))}
                          className="p-1 text-zinc-400 hover:text-red-500 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {pollChoices.length < 6 && (
                    <button
                      type="button"
                      onClick={() => setPollChoices((prev) => [...prev, ''])}
                      className="text-xs font-semibold text-orange-500 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {lang === 'ar' ? 'إضافة خيار' : 'Add Option'}
                    </button>
                  )}
                </div>
              )}

              {/* Composer Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-200 dark:border-zinc-800/80">
                <div className="flex flex-wrap items-center gap-1.5">
                  <label className="px-2.5 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer">
                    <ImageIcon className="w-4 h-4 text-orange-500" />
                    <span className="hidden sm:inline">
                      {uploading ? t.common.loading : lang === 'ar' ? 'صور/فيديو/PDF' : 'Media/PDF'}
                    </span>
                    <input
                      type="file"
                      multiple
                      accept="image/*,video/*,.pdf"
                      onChange={handleUploadMedia}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setShowPoll((v) => !v)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer ${
                      showPoll ? 'bg-orange-500/15 text-orange-500' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <BarChart3 className="w-4 h-4 text-orange-500" />
                    <span className="hidden sm:inline">{t.feed.addPoll}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowBgPicker((v) => !v)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer ${
                      showBgPicker ? 'bg-orange-500/15 text-orange-500' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <Palette className="w-4 h-4 text-orange-500" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowLinkInput((v) => !v)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer ${
                      showLinkInput ? 'bg-orange-500/15 text-orange-500' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <Link2 className="w-4 h-4 text-orange-500" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowLocationInput((v) => !v)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer ${
                      showLocationInput ? 'bg-orange-500/15 text-orange-500' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <MapPin className="w-4 h-4 text-orange-500" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as 'public' | 'friends' | 'private')}
                    className="rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5 text-xs"
                  >
                    <option value="public">{t.common.public}</option>
                    <option value="friends">{t.common.friendsOnly}</option>
                    <option value="private">{t.common.private}</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => setShowPreview(true)}
                    disabled={!content.trim() && mediaFiles.length === 0}
                    className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 text-xs font-medium cursor-pointer whitespace-nowrap"
                  >
                    {t.common.preview}
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePublish(true)}
                    disabled={publishing}
                    className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 text-xs font-medium cursor-pointer whitespace-nowrap"
                  >
                    {t.common.saveDraft}
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePublish(false)}
                    disabled={publishing}
                    className="px-4 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {t.common.publish}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Feed Filter & Sort Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-xl">
          {(
            [
              ['all', lang === 'ar' ? 'الكل' : 'All'],
              ['friends', t.feed.friendsFeed],
              ['saved', t.feed.saved],
              ['drafts', t.feed.drafts],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFeedFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                feedFilter === key
                  ? 'bg-orange-500 text-white'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {activeHashtag && (
            <button
              onClick={() => setActiveHashtag('')}
              className="px-2.5 py-1.5 rounded-lg bg-orange-500/15 text-orange-500 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              #{activeHashtag} <X className="w-3 h-3" />
            </button>
          )}
          <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-xl">
            <button
              onClick={() => setSortMode('latest')}
              className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap ${
                sortMode === 'latest'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white'
                  : 'text-zinc-500'
              }`}
            >
              {t.feed.latest}
            </button>
            <button
              onClick={() => setSortMode('top')}
              className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap ${
                sortMode === 'top'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white'
                  : 'text-zinc-500'
              }`}
            >
              {t.feed.top}
            </button>
          </div>
        </div>
      </div>

      {/* Posts Stream */}
      {filteredPosts.length === 0 ? (
        <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-10 text-center space-y-4">
          <img
            src={TIGER_ASSETS.feedShowcase}
            alt="TIGER Showcase"
            referrerPolicy="no-referrer"
            className="w-full max-w-md mx-auto h-48 object-cover rounded-xl border border-zinc-200 dark:border-zinc-800"
          />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t.feed.noPosts}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              isSaved={savedPostIds.has(post.id)}
              isEditing={editingPostId === post.id}
              editingText={editingText}
              onStartEdit={() => {
                setEditingPostId(post.id);
                setEditingText(post.content);
              }}
              onChangeEdit={setEditingText}
              onSaveEdit={() => handleSaveEdit(post.id)}
              onCancelEdit={() => setEditingPostId(null)}
              onToggleSave={() => handleToggleSave(post)}
              onVotePoll={(idx) => handleVotePoll(post, idx)}
              onShare={() => handleSharePost(post)}
              commentsOpen={openCommentsPostId === post.id}
              onToggleComments={() =>
                setOpenCommentsPostId((cur) => (cur === post.id ? null : post.id))
              }
              onHashtagClick={(tag) => setActiveHashtag(tag)}
              onOpenAuthor={() => openUserProfile(post.authorUid)}
              onReport={() =>
                openReportModal({
                  targetType: 'post',
                  targetId: post.id,
                  label: `${post.authorName}: ${post.content.slice(0, 60)}`,
                })
              }
            />
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">{t.common.preview}</h3>
              <button onClick={() => setShowPreview(false)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div
              className={`rounded-xl p-4 ${
                backgroundStyle
                  ? BACKDROPS.find((b) => b.id === backgroundStyle)?.className || ''
                  : 'bg-zinc-50 dark:bg-zinc-900'
              }`}
            >
              <p className="whitespace-pre-wrap text-sm">{content}</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowPreview(false)}
                className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs cursor-pointer"
              >
                {t.common.close}
              </button>
              <button
                onClick={() => handlePublish(false)}
                className="px-4 py-2 rounded-xl bg-orange-500 text-white text-xs font-bold cursor-pointer"
              >
                {t.common.publish}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PostCard({
  post,
  isSaved,
  isEditing,
  editingText,
  onStartEdit,
  onChangeEdit,
  onSaveEdit,
  onCancelEdit,
  onToggleSave,
  onVotePoll,
  onShare,
  commentsOpen,
  onToggleComments,
  onHashtagClick,
  onOpenAuthor,
  onReport,
}: {
  post: PostItem;
  isSaved: boolean;
  isEditing: boolean;
  editingText: string;
  onStartEdit: () => void;
  onChangeEdit: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onToggleSave: () => void;
  onVotePoll: (idx: number) => void;
  onShare: () => void;
  commentsOpen: boolean;
  onToggleComments: () => void;
  onHashtagClick: (tag: string) => void;
  onOpenAuthor: () => void;
  onReport: () => void;
}) {
  const { firebaseUser, profile, lang, t, pushToast, notifyUser, onlineUids } = useTiger();
  const [myReaction, setMyReaction] = useState<ReactionType | null>(null);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentText, setCommentText] = useState('');
  const [replyParentId, setReplyParentId] = useState<string>('');
  const [commentImage, setCommentImage] = useState<string>('');

  const isOwner = firebaseUser?.uid === post.authorUid;

  // Listen for user's reaction
  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onSnapshot(
      doc(db, 'posts', post.id, 'reactions', firebaseUser.uid),
      (snap) => {
        setMyReaction(snap.exists() ? (snap.data().type as ReactionType) : null);
      },
      () => {}
    );
    return () => unsub();
  }, [firebaseUser, post.id]);

  // Listen for comments when expanded
  useEffect(() => {
    if (!commentsOpen) return;
    const unsub = onSnapshot(
      collection(db, 'posts', post.id, 'comments'),
      (snap) => {
        const items = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<CommentItem, 'id'>) }))
          .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
        setComments(items);
      },
      () => {}
    );
    return () => unsub();
  }, [commentsOpen, post.id]);

  const handleReact = async (type: ReactionType) => {
    if (!firebaseUser) return;
    setReactionPickerOpen(false);
    const ref = doc(db, 'posts', post.id, 'reactions', firebaseUser.uid);
    try {
      if (myReaction === type) {
        await deleteDoc(ref);
        await updateDoc(doc(db, 'posts', post.id), {
          likesCount: Math.max(0, (post.likesCount || 1) - 1),
        });
      } else {
        const wasNew = !myReaction;
        if (wasNew) {
          await setDoc(ref, {
            userId: firebaseUser.uid,
            type,
            createdAt: serverTimestamp(),
          });
          await updateDoc(doc(db, 'posts', post.id), { likesCount: increment(1) });
          await notifyUser({
            recipientUid: post.authorUid,
            type: 'like',
            targetId: post.id,
            message: lang === 'ar' ? `تفاعل مع منشورك (${type})` : `reacted (${type}) to your post`,
          });
        } else {
          await updateDoc(ref, { type });
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `posts/${post.id}/reactions`);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !profile || (!commentText.trim() && !commentImage)) return;
    try {
      await addDoc(collection(db, 'posts', post.id, 'comments'), {
        postId: post.id,
        authorUid: firebaseUser.uid,
        authorName: profile.displayName,
        authorAvatar: profile.avatarUrl || TIGER_ASSETS.logo,
        parentCommentId: replyParentId || '',
        text: (commentText.trim() || (lang === 'ar' ? 'صورة' : 'Image')).slice(0, 1900),
        imageUrl: commentImage || '',
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'posts', post.id), { commentsCount: increment(1) });
      await notifyUser({
        recipientUid: post.authorUid,
        type: 'comment',
        targetId: post.id,
        message: `${lang === 'ar' ? 'علّق على منشورك:' : 'commented:'} ${commentText.trim().slice(0, 80)}`,
      });
      setCommentText('');
      setCommentImage('');
      setReplyParentId('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `posts/${post.id}/comments`);
    }
  };

  const handleCommentImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const up = await uploadPublicMedia(file);
      setCommentImage(up.url);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Image upload failed', 'error');
    }
  };

  const handleDeletePost = async () => {
    try {
      await deleteDoc(doc(db, 'posts', post.id));
      pushToast(lang === 'ar' ? 'تم حذف المنشور' : 'Post deleted', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `posts/${post.id}`);
    }
  };

  const handleTogglePin = async () => {
    await updateDoc(doc(db, 'posts', post.id), {
      isPinned: !post.isPinned,
      updatedAt: serverTimestamp(),
    });
  };

  const handleToggleCommentsDisabled = async () => {
    await updateDoc(doc(db, 'posts', post.id), {
      commentsDisabled: !post.commentsDisabled,
      updatedAt: serverTimestamp(),
    });
  };

  const handlePublishDraft = async () => {
    await updateDoc(doc(db, 'posts', post.id), {
      isDraft: false,
      updatedAt: serverTimestamp(),
    });
    pushToast(lang === 'ar' ? 'تم نشر المسودة' : 'Draft published', 'success');
  };

  const handleCycleVisibility = async () => {
    const next = post.visibility === 'public' ? 'friends' : post.visibility === 'friends' ? 'private' : 'public';
    await updateDoc(doc(db, 'posts', post.id), {
      visibility: next,
      updatedAt: serverTimestamp(),
    });
    pushToast(`${lang === 'ar' ? 'الخصوصية:' : 'Visibility:'} ${next}`, 'info');
  };

  const backdrop = BACKDROPS.find((b) => b.id === post.backgroundStyle);
  const totalPollVotes = (post.pollOptions || []).reduce((acc, o) => acc + (o.votes || 0), 0);

  return (
    <article className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onOpenAuthor} className="cursor-pointer shrink-0">
            <TigerAvatar
              src={post.authorAvatar}
              name={post.authorName}
              size="md"
              online={onlineUids.has(post.authorUid)}
            />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={onOpenAuthor}
                className="font-bold text-sm hover:text-orange-500 transition-colors truncate cursor-pointer"
              >
                {post.authorName}
              </button>
              {post.isPinned && (
                <span className="text-[11px] font-semibold text-orange-500 inline-flex items-center gap-1">
                  <Pin className="w-3 h-3" /> {lang === 'ar' ? 'مثبت' : 'Pinned'}
                </span>
              )}
              {post.isDraft && (
                <span className="text-[11px] font-semibold text-amber-500">
                  · {t.feed.drafts}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span>{formatTimeAgo(post.createdAt?.toMillis?.(), lang)}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                {post.visibility === 'public' ? (
                  <Globe className="w-3 h-3" />
                ) : post.visibility === 'friends' ? (
                  <Users className="w-3 h-3" />
                ) : (
                  <Lock className="w-3 h-3" />
                )}
                {post.visibility}
              </span>
              {post.location && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-0.5 truncate max-w-[140px]">
                    <MapPin className="w-3 h-3 text-orange-500" /> {post.location}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Author / Action controls */}
        <div className="flex items-center gap-1 shrink-0">
          {isOwner ? (
            <>
              {post.isDraft && (
                <button
                  onClick={handlePublishDraft}
                  className="px-2.5 py-1 rounded-lg bg-orange-500 text-white text-xs font-semibold cursor-pointer"
                >
                  {t.common.publish}
                </button>
              )}
              <button
                onClick={handleTogglePin}
                title={post.isPinned ? t.feed.unpinPost : t.feed.pinPost}
                className={`p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer ${
                  post.isPinned ? 'text-orange-500' : 'text-zinc-400'
                }`}
              >
                <Pin className="w-4 h-4" />
              </button>
              <button
                onClick={handleCycleVisibility}
                title="Change Privacy"
                className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <Lock className="w-4 h-4" />
              </button>
              <button
                onClick={handleToggleCommentsDisabled}
                title={post.commentsDisabled ? t.feed.enableComments : t.feed.disableComments}
                className={`p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer ${
                  post.commentsDisabled ? 'text-orange-500' : 'text-zinc-400'
                }`}
              >
                <MessageSquareOff className="w-4 h-4" />
              </button>
              <button
                onClick={onStartEdit}
                title={t.common.edit}
                className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                onClick={handleDeletePost}
                title={t.common.delete}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              onClick={onReport}
              title={t.common.report}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-orange-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
            >
              <Flag className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={editingText}
            onChange={(e) => onChangeEdit(e.target.value)}
            rows={3}
            className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-orange-500 p-3 text-sm focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={onCancelEdit}
              className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs cursor-pointer"
            >
              {t.common.cancel}
            </button>
            <button
              onClick={onSaveEdit}
              className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" /> {t.common.save}
            </button>
          </div>
        </div>
      ) : (
        post.content && (
          <div
            className={
              backdrop?.className
                ? `${backdrop.className} rounded-xl p-6 text-center text-lg font-bold leading-relaxed whitespace-pre-wrap`
                : 'text-sm leading-relaxed whitespace-pre-wrap text-zinc-800 dark:text-zinc-200'
            }
          >
            {post.content}
          </div>
        )
      )}

      {/* Hashtags */}
      {post.hashtags && post.hashtags.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs text-orange-500 font-medium">
          {post.hashtags.map((tag) => (
            <button
              key={tag}
              onClick={() => onHashtagClick(tag)}
              className="hover:underline cursor-pointer"
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {/* Multi-Media Grid */}
      {post.mediaUrls && post.mediaUrls.length > 0 && (
        <div
          className={`grid gap-2 ${
            post.mediaUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
          }`}
        >
          {post.mediaUrls.map((url, idx) => {
            const mType = post.mediaTypes?.[idx] || 'image';
            return (
              <div
                key={`${url}-${idx}`}
                className="rounded-xl overflow-hidden bg-zinc-950 border border-zinc-200 dark:border-zinc-800"
              >
                {mType === 'video' ? (
                  <video src={url} controls className="w-full max-h-[420px] object-contain" />
                ) : (
                  <img
                    src={url}
                    alt={`Post media ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    className="w-full max-h-[440px] object-cover"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* PDF Attachment */}
      {post.pdfUrl && (
        <a
          href={post.pdfUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-orange-500/60 transition-colors"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className="w-5 h-5 text-orange-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold truncate">{post.pdfName || 'Document.pdf'}</div>
              <div className="text-[11px] text-zinc-500">PDF Document</div>
            </div>
          </div>
          <span className="text-xs font-semibold text-orange-500 shrink-0">
            {lang === 'ar' ? 'فتح' : 'Open'}
          </span>
        </a>
      )}

      {/* External Link */}
      {post.externalLink && (
        <a
          href={post.externalLink}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs text-orange-500 hover:underline truncate"
        >
          <Link2 className="w-4 h-4 shrink-0" />
          <span className="truncate">{post.externalLink}</span>
        </a>
      )}

      {/* Interactive Poll */}
      {post.pollQuestion && post.pollOptions && post.pollOptions.length > 0 && (
        <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 space-y-2.5">
          <div className="text-sm font-bold">{post.pollQuestion}</div>
          <div className="space-y-2">
            {post.pollOptions.map((opt, idx) => {
              const pct = totalPollVotes > 0 ? Math.round(((opt.votes || 0) / totalPollVotes) * 100) : 0;
              const voted = (opt.voterUids || []).includes(firebaseUser?.uid || '');
              return (
                <button
                  key={`${opt.label}-${idx}`}
                  onClick={() => onVotePoll(idx)}
                  className={`w-full relative overflow-hidden rounded-xl border p-2.5 text-start transition-colors cursor-pointer ${
                    voted
                      ? 'border-orange-500 bg-orange-500/10'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-orange-500/40'
                  }`}
                >
                  <div
                    className="absolute inset-y-0 start-0 bg-orange-500/15 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                  <div className="relative flex items-center justify-between text-xs font-medium">
                    <span>{opt.label}</span>
                    <span className="font-mono tabular-nums text-zinc-500">
                      {pct}% ({opt.votes || 0})
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="text-[11px] text-zinc-500 tabular-nums">
            {totalPollVotes} {lang === 'ar' ? 'صوت' : 'votes'}
          </div>
        </div>
      )}

      {/* Metrics Footer */}
      <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 pt-1">
        <div className="flex items-center gap-3 tabular-nums">
          <span>
            {post.likesCount || 0} {lang === 'ar' ? 'تفاعل' : 'reactions'}
          </span>
          <span>·</span>
          <span>
            {post.commentsCount || 0} {t.feed.comments}
          </span>
          <span>·</span>
          <span>
            {post.sharesCount || 0} {t.feed.shares}
          </span>
        </div>
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Eye className="w-3.5 h-3.5" /> {post.viewsCount || 1} {t.feed.views}
        </span>
      </div>

      {/* Action Buttons Row */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800/80 relative">
        <div className="relative">
          <button
            onClick={() => setReactionPickerOpen((v) => !v)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              myReaction
                ? 'bg-orange-500/15 text-orange-500'
                : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
            }`}
          >
            <span>
              {myReaction ? REACTIONS.find((r) => r.type === myReaction)?.emoji : '👍'}
            </span>
            <span>
              {myReaction
                ? lang === 'ar'
                  ? REACTIONS.find((r) => r.type === myReaction)?.labelAr
                  : REACTIONS.find((r) => r.type === myReaction)?.labelEn
                : lang === 'ar'
                ? 'تفاعل'
                : 'React'}
            </span>
          </button>

          {reactionPickerOpen && (
            <div className="absolute bottom-full mb-2 start-0 z-30 flex items-center gap-1 p-1.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-xl">
              {REACTIONS.map((r) => (
                <button
                  key={r.type}
                  onClick={() => handleReact(r.type)}
                  title={lang === 'ar' ? r.labelAr : r.labelEn}
                  className="w-9 h-9 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:scale-110 transition-transform text-lg cursor-pointer"
                >
                  {r.emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={onToggleComments}
          className="px-3 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-600 dark:text-zinc-300 inline-flex items-center gap-1.5 cursor-pointer"
        >
          <MessageCircle className="w-4 h-4" />
          <span>{t.feed.comments}</span>
        </button>

        <button
          onClick={onShare}
          className="px-3 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-600 dark:text-zinc-300 inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Share2 className="w-4 h-4" />
          <span className="hidden sm:inline">{t.common.share}</span>
        </button>

        <button
          onClick={() => {
            navigator.clipboard.writeText(`${window.location.origin}/?post=${post.id}`).catch(() => {});
            pushToast(t.common.copied, 'info');
          }}
          className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 cursor-pointer"
          title={t.common.copyLink}
        >
          <Copy className="w-4 h-4" />
        </button>

        <button
          onClick={onToggleSave}
          className={`p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer ${
            isSaved ? 'text-orange-500' : 'text-zinc-500'
          }`}
          title={t.feed.saved}
        >
          <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-orange-500' : ''}`} />
        </button>
      </div>

      {/* Threaded Comments Section */}
      {commentsOpen && (
        <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
          {post.commentsDisabled ? (
            <p className="text-xs text-zinc-500 text-center py-2">
              {lang === 'ar' ? 'التعليقات موقفة على هذا المنشور.' : 'Comments are disabled on this post.'}
            </p>
          ) : (
            <form onSubmit={handleAddComment} className="space-y-2">
              {replyParentId && (
                <div className="flex items-center justify-between text-[11px] text-orange-500 px-2">
                  <span>{lang === 'ar' ? 'الرد على تعليق...' : 'Replying to comment...'}</span>
                  <button type="button" onClick={() => setReplyParentId('')} className="cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              {commentImage && (
                <div className="relative w-24 h-20 rounded-lg overflow-hidden">
                  <img src={commentImage} alt="Comment upload" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setCommentImage('')}
                    className="absolute top-1 end-1 p-0.5 rounded-full bg-black/75 text-white cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={t.feed.writeComment}
                  className="flex-1 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3.5 py-2 text-xs focus:outline-none focus:border-orange-500"
                />
                <label className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                  <ImageIcon className="w-4 h-4 text-zinc-500" />
                  <input type="file" accept="image/*" onChange={handleCommentImageUpload} className="hidden" />
                </label>
                <button
                  type="submit"
                  className="px-3.5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold cursor-pointer"
                >
                  {t.common.send}
                </button>
              </div>
            </form>
          )}

          <div className="space-y-2.5 max-h-72 overflow-y-auto">
            {comments.map((c) => (
              <div
                key={c.id}
                className={`flex items-start gap-2.5 ${c.parentCommentId ? 'ms-8' : ''}`}
              >
                <TigerAvatar src={c.authorAvatar} name={c.authorName} size="xs" />
                <div className="flex-1 rounded-xl bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200/70 dark:border-zinc-800 p-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold">{c.authorName}</span>
                    <span className="text-[10px] text-zinc-500">
                      {formatTimeAgo(c.createdAt?.toMillis?.(), lang)}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-700 dark:text-zinc-300">{c.text}</p>
                  {c.imageUrl && (
                    <img
                      src={c.imageUrl}
                      alt="Comment media"
                      referrerPolicy="no-referrer"
                      className="max-h-40 rounded-lg object-cover mt-1"
                    />
                  )}
                  <div className="flex items-center gap-3 pt-1">
                    {!post.commentsDisabled && (
                      <button
                        onClick={() => setReplyParentId(c.id)}
                        className="text-[11px] font-semibold text-orange-500 hover:underline cursor-pointer"
                      >
                        {t.feed.reply}
                      </button>
                    )}
                    {(c.authorUid === firebaseUser?.uid || isOwner) && (
                      <button
                        onClick={() => deleteDoc(doc(db, 'posts', post.id, 'comments', c.id))}
                        className="text-[11px] text-zinc-400 hover:text-red-500 cursor-pointer"
                      >
                        {t.common.delete}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
