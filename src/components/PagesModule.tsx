import React, { useEffect, useState } from 'react';
import {
  collection,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import {
  Flag,
  Plus,
  Image as ImageIcon,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Heart,
  Trash2,
  Eye,
  FileText,
  Users,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useTiger } from '../context/TigerContext';
import { PageItem, PostItem } from '../types/tiger';
import { uploadPublicMedia } from '../lib/upload';
import { TIGER_ASSETS } from '../lib/assets';
import { TigerAvatar } from './StatusViews';
import { SocialFeed } from './SocialFeed';

export function PagesModule() {
  const { firebaseUser, lang, globalSearch, notifyUser, pushToast } = useTiger();

  const [pages, setPages] = useState<PageItem[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [followerIds, setFollowerIds] = useState<Set<string>>(new Set());
  const [pagePosts, setPagePosts] = useState<PostItem[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('Technology');
  const [description, setDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string>(TIGER_ASSETS.logo);
  const [coverUrl, setCoverUrl] = useState<string>(TIGER_ASSETS.feedShowcase);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onSnapshot(
      collection(db, 'pages'),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<PageItem, 'id'>) }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setPages(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'pages')
    );
    return () => unsub();
  }, [firebaseUser]);

  useEffect(() => {
    if (!selectedPageId) {
      setFollowerIds(new Set());
      setPagePosts([]);
      return;
    }
    const u1 = onSnapshot(
      collection(db, 'pages', selectedPageId, 'followers'),
      (snap) => {
        setFollowerIds(new Set(snap.docs.map((d) => d.id)));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `pages/${selectedPageId}/followers`)
    );
    const u2 = onSnapshot(
      query(collection(db, 'posts'), where('pageId', '==', selectedPageId)),
      (snap) => {
        setPagePosts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PostItem, 'id'>) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `posts(page=${selectedPageId})`)
    );
    return () => {
      u1();
      u2();
    };
  }, [selectedPageId]);

  if (!firebaseUser) return null;

  const selectedPage = pages.find((p) => p.id === selectedPageId) || null;
  const isOwner = selectedPage?.ownerUid === firebaseUser.uid;
  const isFollowing = selectedPage ? followerIds.has(firebaseUser.uid) : false;

  const handleUploadAsset = async (e: React.ChangeEvent<HTMLInputElement>, target: 'avatar' | 'cover') => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const uploaded = await uploadPublicMedia(file);
      if (target === 'avatar') setAvatarUrl(uploaded.url);
      else setCoverUrl(uploaded.url);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Upload failed', 'error');
    }
  };

  const handleCreatePage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      pushToast(lang === 'ar' ? 'اسم الصفحة قصير جداً' : 'Page name must be at least 2 characters', 'error');
      return;
    }
    setCreating(true);
    try {
      const ref = await addDoc(collection(db, 'pages'), {
        name: name.trim().slice(0, 100),
        category: category.trim().slice(0, 60) || 'Creator',
        description: description.trim().slice(0, 600),
        avatarUrl,
        coverUrl,
        ownerUid: firebaseUser.uid,
        followersCount: 0,
        createdAt: serverTimestamp(),
      });
      setName('');
      setDescription('');
      setShowCreate(false);
      setSelectedPageId(ref.id);
      pushToast(lang === 'ar' ? 'تم إنشاء الصفحة بنجاح' : 'Page created successfully', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'pages');
    } finally {
      setCreating(false);
    }
  };

  const toggleFollowPage = async (page: PageItem) => {
    const ref = doc(db, 'pages', page.id, 'followers', firebaseUser.uid);
    try {
      if (followerIds.has(firebaseUser.uid)) {
        await deleteDoc(ref);
        await updateDoc(doc(db, 'pages', page.id), {
          followersCount: Math.max(0, (page.followersCount || 1) - 1),
        }).catch(() => {});
        pushToast(lang === 'ar' ? 'تم إلغاء متابعة الصفحة' : 'Unfollowed page', 'info');
      } else {
        await setDoc(ref, {
          uid: firebaseUser.uid,
          followedAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'pages', page.id), {
          followersCount: increment(1),
        }).catch(() => {});
        await notifyUser({
          recipientUid: page.ownerUid,
          type: 'page',
          message:
            lang === 'ar'
              ? `بدأ بمتابعة صفحتك "${page.name}"`
              : `started following your page "${page.name}"`,
          targetId: page.id,
        });
        pushToast(lang === 'ar' ? 'تتابع الصفحة الآن' : 'Following page', 'success');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `pages/${page.id}/followers/${firebaseUser.uid}`);
    }
  };

  const handleDeletePage = async (page: PageItem) => {
    try {
      await deleteDoc(doc(db, 'pages', page.id));
      setSelectedPageId(null);
      pushToast(lang === 'ar' ? 'تم حذف الصفحة' : 'Page deleted', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `pages/${page.id}`);
    }
  };

  const filteredPages = pages.filter((p) => {
    if (!globalSearch.trim()) return true;
    const q = globalSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q)
    );
  });

  if (selectedPage) {
    const BackIcon = lang === 'ar' ? ArrowRight : ArrowLeft;
    const totalLikes = pagePosts.reduce((sum, p) => sum + (p.likesCount || 0), 0);
    const totalViews = pagePosts.reduce((sum, p) => sum + (p.viewsCount || 0), 0);

    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelectedPageId(null)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400 hover:text-orange-500 cursor-pointer"
        >
          <BackIcon className="w-4 h-4" />
          {lang === 'ar' ? 'العودة لجميع الصفحات' : 'Back to All Pages'}
        </button>

        <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
          <div className="h-44 sm:h-52 relative bg-zinc-900">
            <img
              src={selectedPage.coverUrl || TIGER_ASSETS.feedShowcase}
              alt={selectedPage.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
          </div>
          <div className="px-5 pb-5 -mt-10 relative flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="flex items-end gap-4">
              <div className="ring-4 ring-white dark:ring-[#121216] rounded-full">
                <TigerAvatar src={selectedPage.avatarUrl} name={selectedPage.name} size="xl" />
              </div>
              <div className="pb-1">
                <h1 className="font-display text-2xl font-extrabold">{selectedPage.name}</h1>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                  {selectedPage.category} · {selectedPage.followersCount ?? followerIds.size}{' '}
                  {lang === 'ar' ? 'متابع' : 'followers'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleFollowPage(selectedPage)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                  isFollowing
                    ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
                    : 'bg-orange-500 hover:bg-orange-600 text-white'
                }`}
              >
                <Heart className={`w-3.5 h-3.5 ${isFollowing ? 'fill-orange-500 text-orange-500' : ''}`} />
                {isFollowing ? (lang === 'ar' ? 'متابَع' : 'Following') : lang === 'ar' ? 'متابعة الصفحة' : 'Follow Page'}
              </button>
              {isOwner && (
                <button
                  onClick={() => handleDeletePage(selectedPage)}
                  className="px-3.5 py-2 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {lang === 'ar' ? 'حذف' : 'Delete'}
                </button>
              )}
            </div>
          </div>

          {selectedPage.description && (
            <p className="px-5 pb-4 text-sm text-zinc-600 dark:text-zinc-300">{selectedPage.description}</p>
          )}
        </div>

        {/* Analytics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: Users, label: lang === 'ar' ? 'المتابعون' : 'Followers', val: selectedPage.followersCount ?? followerIds.size },
            { icon: FileText, label: lang === 'ar' ? 'المنشورات' : 'Posts', val: pagePosts.length },
            { icon: Heart, label: lang === 'ar' ? 'التفاعلات' : 'Reactions', val: totalLikes },
            { icon: Eye, label: lang === 'ar' ? 'المشاهدات' : 'Views', val: totalViews },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4"
            >
              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>{stat.label}</span>
                <stat.icon className="w-4 h-4 text-orange-500" />
              </div>
              <div className="font-mono text-2xl font-bold mt-2 tabular-nums">{stat.val}</div>
            </div>
          ))}
        </div>

        {/* Page Posts Feed */}
        <SocialFeed pageId={selectedPage.id} hideStories />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight flex items-center gap-2.5">
            <Flag className="w-6 h-6 text-orange-500" />
            {lang === 'ar' ? 'صفحات TIGER للأعمال والمبدعين' : 'TIGER Pages'}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {lang === 'ar'
              ? 'أنشئ صفحة تجارية أو شخصية، انشر محتوى للجمهور وتابع الإحصائيات الفورية.'
              : 'Launch personal or business pages, publish updates, and track real engagement.'}
          </p>
        </div>

        <button
          onClick={() => setShowCreate((v) => !v)}
          className="px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          {lang === 'ar' ? 'إنشاء صفحة جديدة' : 'Create Page'}
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreatePage}
          className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4"
        >
          <h2 className="font-bold text-base">
            {lang === 'ar' ? 'بيانات الصفحة الجديدة' : 'New Page Details'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={100}
              placeholder={lang === 'ar' ? 'اسم الصفحة...' : 'Page name...'}
              className="px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm focus:outline-none focus:border-orange-500"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm focus:outline-none focus:border-orange-500"
            >
              <option value="Technology">{lang === 'ar' ? 'تقنية وبرمجة' : 'Technology'}</option>
              <option value="Business">{lang === 'ar' ? 'أعمال وشركات' : 'Business & Brand'}</option>
              <option value="Creator">{lang === 'ar' ? 'صانع محتوى' : 'Digital Creator'}</option>
              <option value="Education">{lang === 'ar' ? 'تعليم وتدريب' : 'Education'}</option>
              <option value="Media">{lang === 'ar' ? 'إعلام وأخبار' : 'Media & News'}</option>
            </select>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={600}
            placeholder={lang === 'ar' ? 'نبذة عن الصفحة...' : 'About this page...'}
            className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm focus:outline-none focus:border-orange-500"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer hover:border-orange-500">
                <ImageIcon className="w-3.5 h-3.5 text-orange-500" />
                {lang === 'ar' ? 'شعار الصفحة' : 'Page Avatar'}
                <input type="file" accept="image/*" onChange={(e) => handleUploadAsset(e, 'avatar')} className="hidden" />
              </label>
              <label className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer hover:border-orange-500">
                <ImageIcon className="w-3.5 h-3.5 text-orange-500" />
                {lang === 'ar' ? 'غلاف الصفحة' : 'Page Cover'}
                <input type="file" accept="image/*" onChange={(e) => handleUploadAsset(e, 'cover')} className="hidden" />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold cursor-pointer"
              >
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold cursor-pointer"
              >
                {creating ? '...' : lang === 'ar' ? 'إنشاء الصفحة' : 'Create Page'}
              </button>
            </div>
          </div>
        </form>
      )}

      {filteredPages.length === 0 ? (
        <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center space-y-2">
          <BarChart3 className="w-8 h-8 mx-auto text-orange-500 opacity-75" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {lang === 'ar' ? 'لا توجد صفحات بعد. أنشئ أول صفحة على TIGER.' : 'No pages yet. Create the first page on TIGER.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredPages.map((page) => (
            <div
              key={page.id}
              onClick={() => setSelectedPageId(page.id)}
              className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden hover:border-orange-500/50 transition-colors cursor-pointer"
            >
              <div className="h-28 bg-zinc-900">
                <img
                  src={page.coverUrl || TIGER_ASSETS.feedShowcase}
                  alt={page.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-4 -mt-7">
                <div className="ring-2 ring-white dark:ring-[#121216] rounded-full w-fit">
                  <TigerAvatar src={page.avatarUrl} name={page.name} size="md" />
                </div>
                <h3 className="font-bold text-base mt-2 truncate">{page.name}</h3>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                  {page.category} · {page.followersCount || 0} {lang === 'ar' ? 'متابع' : 'followers'}
                </div>
                {page.description && (
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-2 line-clamp-2">{page.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
