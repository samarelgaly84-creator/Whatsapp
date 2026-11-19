import React, { useEffect, useState } from 'react';
import {
  collection,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import {
  Users2,
  Plus,
  Lock,
  Globe,
  MessageSquare,
  Shield,
  Check,
  X,
  ArrowLeft,
  ArrowRight,
  Image as ImageIcon,
  LogOut,
  Trash2,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useTiger } from '../context/TigerContext';
import { GroupItem, GroupMemberItem } from '../types/tiger';
import { uploadPublicMedia } from '../lib/upload';
import { TIGER_ASSETS } from '../lib/assets';
import { TigerAvatar } from './StatusViews';
import { SocialFeed } from './SocialFeed';

export function GroupsModule() {
  const {
    firebaseUser,
    profile,
    lang,
    globalSearch,
    notifyUser,
    pushToast,
    setActiveSection,
    openUserProfile,
  } = useTiger();

  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [members, setMembers] = useState<GroupMemberItem[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'private'>('public');
  const [coverUrl, setCoverUrl] = useState<string>(TIGER_ASSETS.coverStudio);
  const [creating, setCreating] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onSnapshot(
      collection(db, 'groups'),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<GroupItem, 'id'>) }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setGroups(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'groups')
    );
    return () => unsub();
  }, [firebaseUser]);

  useEffect(() => {
    if (!selectedGroupId) {
      setMembers([]);
      return;
    }
    const unsub = onSnapshot(
      collection(db, 'groups', selectedGroupId, 'members'),
      (snap) => {
        setMembers(snap.docs.map((d) => d.data() as GroupMemberItem));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `groups/${selectedGroupId}/members`)
    );
    return () => unsub();
  }, [selectedGroupId]);

  if (!firebaseUser || !profile) return null;

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || null;
  const myMembership = members.find((m) => m.uid === firebaseUser.uid);
  const isOwner = selectedGroup?.ownerUid === firebaseUser.uid;
  const isActiveMember = myMembership?.status === 'active';
  const activeMembers = members.filter((m) => m.status === 'active');
  const pendingMembers = members.filter((m) => m.status === 'pending');

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      const uploaded = await uploadPublicMedia(file);
      setCoverUrl(uploaded.url);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Upload failed', 'error');
    } finally {
      setUploadingCover(false);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      pushToast(lang === 'ar' ? 'اسم المجموعة قصير جداً' : 'Group name must be at least 2 characters', 'error');
      return;
    }
    setCreating(true);
    try {
      const groupRef = await addDoc(collection(db, 'groups'), {
        name: name.trim().slice(0, 100),
        description: description.trim().slice(0, 600),
        coverUrl: coverUrl || TIGER_ASSETS.coverStudio,
        privacy,
        ownerUid: firebaseUser.uid,
        membersCount: 1,
        createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'groups', groupRef.id, 'members', firebaseUser.uid), {
        uid: firebaseUser.uid,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl || '',
        role: 'owner',
        status: 'active',
        joinedAt: serverTimestamp(),
      });
      setName('');
      setDescription('');
      setShowCreate(false);
      setSelectedGroupId(groupRef.id);
      pushToast(lang === 'ar' ? 'تم إنشاء المجموعة بنجاح' : 'Group created successfully', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'groups');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinGroup = async (group: GroupItem) => {
    const nextStatus = group.privacy === 'private' ? 'pending' : 'active';
    try {
      await setDoc(doc(db, 'groups', group.id, 'members', firebaseUser.uid), {
        uid: firebaseUser.uid,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl || '',
        role: 'member',
        status: nextStatus,
        joinedAt: serverTimestamp(),
      });
      if (nextStatus === 'active') {
        await updateDoc(doc(db, 'groups', group.id), { membersCount: increment(1) }).catch(() => {});
        pushToast(lang === 'ar' ? 'انضممت للمجموعة بنجاح' : 'Joined group', 'success');
      } else {
        await notifyUser({
          recipientUid: group.ownerUid,
          type: 'group',
          message:
            lang === 'ar'
              ? `طلب الانضمام إلى مجموعة "${group.name}"`
              : `requested to join "${group.name}"`,
          targetId: group.id,
        });
        pushToast(
          lang === 'ar' ? 'تم إرسال طلب الانضمام لمشرف المجموعة' : 'Join request sent to group owner',
          'info'
        );
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `groups/${group.id}/members/${firebaseUser.uid}`);
    }
  };

  const handleLeaveGroup = async (group: GroupItem) => {
    try {
      await deleteDoc(doc(db, 'groups', group.id, 'members', firebaseUser.uid));
      const nextCount = Math.max(1, (group.membersCount || 1) - 1);
      await updateDoc(doc(db, 'groups', group.id), { membersCount: nextCount }).catch(() => {});
      pushToast(lang === 'ar' ? 'غادرت المجموعة' : 'Left group', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `groups/${group.id}/members/${firebaseUser.uid}`);
    }
  };

  const handleApproveMember = async (member: GroupMemberItem) => {
    if (!selectedGroup) return;
    try {
      await updateDoc(doc(db, 'groups', selectedGroup.id, 'members', member.uid), {
        status: 'active',
      });
      await updateDoc(doc(db, 'groups', selectedGroup.id), { membersCount: increment(1) }).catch(() => {});
      await notifyUser({
        recipientUid: member.uid,
        type: 'group',
        message:
          lang === 'ar'
            ? `تمت الموافقة على انضمامك لمجموعة "${selectedGroup.name}"`
            : `approved your request to join "${selectedGroup.name}"`,
        targetId: selectedGroup.id,
      });
      pushToast(lang === 'ar' ? 'تم قبول العضو' : 'Member approved', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `groups/${selectedGroup.id}/members/${member.uid}`);
    }
  };

  const handleToggleModerator = async (member: GroupMemberItem) => {
    if (!selectedGroup) return;
    const nextRole = member.role === 'moderator' ? 'member' : 'moderator';
    try {
      await updateDoc(doc(db, 'groups', selectedGroup.id, 'members', member.uid), {
        role: nextRole,
      });
      pushToast(
        nextRole === 'moderator'
          ? lang === 'ar'
            ? 'تمت الترقية لمشرف'
            : 'Promoted to moderator'
          : lang === 'ar'
          ? 'تم إرجاع الصلاحية لعضو'
          : 'Changed to member',
        'success'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `groups/${selectedGroup.id}/members/${member.uid}`);
    }
  };

  const handleRemoveMember = async (member: GroupMemberItem) => {
    if (!selectedGroup) return;
    try {
      await deleteDoc(doc(db, 'groups', selectedGroup.id, 'members', member.uid));
      if (member.status === 'active') {
        await updateDoc(doc(db, 'groups', selectedGroup.id), {
          membersCount: Math.max(1, (selectedGroup.membersCount || 1) - 1),
        }).catch(() => {});
      }
      pushToast(lang === 'ar' ? 'تمت إزالة العضو' : 'Member removed', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `groups/${selectedGroup.id}/members/${member.uid}`);
    }
  };

  const handleDeleteGroup = async (group: GroupItem) => {
    try {
      await deleteDoc(doc(db, 'groups', group.id));
      setSelectedGroupId(null);
      pushToast(lang === 'ar' ? 'تم حذف المجموعة' : 'Group deleted', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `groups/${group.id}`);
    }
  };

  const handleOpenGroupChat = async () => {
    if (!selectedGroup) return;
    const participantUids = Array.from(new Set([firebaseUser.uid, ...activeMembers.map((m) => m.uid)])).slice(0, 50);
    const chatId = `grp_${selectedGroup.id}`;
    try {
      await setDoc(
        doc(db, 'chats', chatId),
        {
          type: 'group',
          name: selectedGroup.name,
          ownerUid: firebaseUser.uid,
          participantUids,
          lastMessageText: '',
          lastMessageSenderUid: '',
          e2eeEnabled: false,
          pinnedBy: [],
          archivedBy: [],
          mutedBy: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: false }
      ).catch(() => {});
      setActiveSection('chat');
      pushToast(lang === 'ar' ? 'تم فتح محادثة المجموعة' : 'Group chat opened in TIGER Chat', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `chats/${chatId}`);
    }
  };

  const filteredGroups = groups.filter((g) => {
    if (!globalSearch.trim()) return true;
    const q = globalSearch.toLowerCase();
    return g.name.toLowerCase().includes(q) || (g.description || '').toLowerCase().includes(q);
  });

  if (selectedGroup) {
    const BackIcon = lang === 'ar' ? ArrowRight : ArrowLeft;
    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelectedGroupId(null)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400 hover:text-orange-500 cursor-pointer"
        >
          <BackIcon className="w-4 h-4" />
          {lang === 'ar' ? 'العودة لجميع المجموعات' : 'Back to All Groups'}
        </button>

        {/* Group Banner */}
        <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
          <div className="h-44 sm:h-52 relative bg-zinc-900">
            <img
              src={selectedGroup.coverUrl || TIGER_ASSETS.coverStudio}
              alt={selectedGroup.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
            <div className="absolute bottom-4 inset-x-5 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div className="text-white">
                <h1 className="font-display text-2xl font-extrabold">{selectedGroup.name}</h1>
                <div className="text-xs text-zinc-200 flex items-center gap-2 mt-1 tabular-nums">
                  {selectedGroup.privacy === 'private' ? (
                    <Lock className="w-3.5 h-3.5 text-orange-400" />
                  ) : (
                    <Globe className="w-3.5 h-3.5 text-orange-400" />
                  )}
                  <span>
                    {selectedGroup.privacy === 'private'
                      ? lang === 'ar'
                        ? 'مجموعة خاصة'
                        : 'Private Group'
                      : lang === 'ar'
                      ? 'مجموعة عامة'
                      : 'Public Group'}
                  </span>
                  <span>·</span>
                  <span>
                    {selectedGroup.membersCount || activeMembers.length} {lang === 'ar' ? 'عضو' : 'members'}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isActiveMember && (
                  <button
                    onClick={handleOpenGroupChat}
                    className="px-3.5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <MessageSquare className="w-4 h-4" />
                    {lang === 'ar' ? 'دردشة المجموعة' : 'Group Chat'}
                  </button>
                )}
                {!myMembership ? (
                  <button
                    onClick={() => handleJoinGroup(selectedGroup)}
                    className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold cursor-pointer"
                  >
                    {selectedGroup.privacy === 'private'
                      ? lang === 'ar'
                        ? 'طلب الانضمام'
                        : 'Request to Join'
                      : lang === 'ar'
                      ? 'انضمام للمجموعة'
                      : 'Join Group'}
                  </button>
                ) : myMembership.status === 'pending' ? (
                  <button
                    onClick={() => handleLeaveGroup(selectedGroup)}
                    className="px-3.5 py-2 rounded-xl bg-zinc-800 text-zinc-200 text-xs font-semibold cursor-pointer"
                  >
                    {lang === 'ar' ? 'بانتظار الموافقة (إلغاء)' : 'Pending Approval (Cancel)'}
                  </button>
                ) : !isOwner ? (
                  <button
                    onClick={() => handleLeaveGroup(selectedGroup)}
                    className="px-3.5 py-2 rounded-xl bg-zinc-900/80 text-white border border-white/20 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    {lang === 'ar' ? 'مغادرة' : 'Leave'}
                  </button>
                ) : (
                  <button
                    onClick={() => handleDeleteGroup(selectedGroup)}
                    className="px-3.5 py-2 rounded-xl bg-red-600/90 hover:bg-red-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {lang === 'ar' ? 'حذف المجموعة' : 'Delete Group'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {selectedGroup.description && (
            <p className="px-5 py-4 text-sm text-zinc-600 dark:text-zinc-300 border-t border-zinc-200 dark:border-zinc-800">
              {selectedGroup.description}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Group Feed */}
          <div className="lg:col-span-2">
            {selectedGroup.privacy === 'private' && !isActiveMember && !isOwner ? (
              <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-10 text-center space-y-2">
                <Lock className="w-7 h-7 mx-auto text-orange-500" />
                <h3 className="font-bold text-base">
                  {lang === 'ar' ? 'هذه المجموعة خاصة' : 'This Group is Private'}
                </h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {lang === 'ar'
                    ? 'انضم إلى المجموعة لمشاهدة المنشورات والمشاركة في النقاشات.'
                    : 'Join this group and await approval to view posts and discussions.'}
                </p>
              </div>
            ) : (
              <SocialFeed groupId={selectedGroup.id} hideStories />
            )}
          </div>

          {/* Members & Moderation Sidebar */}
          <div className="space-y-4">
            {isOwner && pendingMembers.length > 0 && (
              <div className="bg-white dark:bg-[#121216] border border-orange-500/40 rounded-2xl p-4 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-orange-500">
                  {lang === 'ar' ? 'طلبات الانضمام المعلقة' : 'Pending Join Requests'} ({pendingMembers.length})
                </div>
                {pendingMembers.map((m) => (
                  <div key={m.uid} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <TigerAvatar src={m.avatarUrl} name={m.displayName} size="sm" />
                      <span className="text-xs font-semibold truncate">{m.displayName}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleApproveMember(m)}
                        className="p-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 cursor-pointer"
                        title={lang === 'ar' ? 'قبول' : 'Approve'}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleRemoveMember(m)}
                        className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:text-red-500 cursor-pointer"
                        title={lang === 'ar' ? 'رفض' : 'Decline'}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                {lang === 'ar' ? 'الأعضاء والمشرفون' : 'Members & Moderators'} ({activeMembers.length})
              </div>
              <div className="space-y-2.5 max-h-96 overflow-y-auto">
                {activeMembers.map((m) => (
                  <div key={m.uid} className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => openUserProfile(m.uid)}
                      className="flex items-center gap-2.5 min-w-0 text-start cursor-pointer"
                    >
                      <TigerAvatar src={m.avatarUrl} name={m.displayName} size="sm" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">{m.displayName}</div>
                        <div className="text-[11px] text-zinc-500 capitalize">
                          {m.role === 'owner'
                            ? lang === 'ar'
                              ? 'المؤسس'
                              : 'Owner'
                            : m.role === 'moderator'
                            ? lang === 'ar'
                              ? 'مشرف'
                              : 'Moderator'
                            : lang === 'ar'
                            ? 'عضو'
                            : 'Member'}
                        </div>
                      </div>
                    </button>
                    {isOwner && m.uid !== firebaseUser.uid && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggleModerator(m)}
                          title={lang === 'ar' ? 'تبديل دور مشرف' : 'Toggle Moderator'}
                          className={`p-1.5 rounded-lg border text-xs cursor-pointer ${
                            m.role === 'moderator'
                              ? 'border-orange-500 text-orange-500 bg-orange-500/10'
                              : 'border-zinc-200 dark:border-zinc-700 text-zinc-500'
                          }`}
                        >
                          <Shield className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleRemoveMember(m)}
                          title={lang === 'ar' ? 'إزالة' : 'Remove'}
                          className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-red-500 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight flex items-center gap-2.5">
            <Users2 className="w-6 h-6 text-orange-500" />
            {lang === 'ar' ? 'مجموعات TIGER' : 'TIGER Groups'}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {lang === 'ar'
              ? 'أنشئ مجتمعات عامة أو خاصة بنقاشات ومنشورات ودردشة جماعية.'
              : 'Create public or private communities with feeds, moderators, and group chat.'}
          </p>
        </div>

        <button
          onClick={() => setShowCreate((v) => !v)}
          className="px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          {lang === 'ar' ? 'إنشاء مجموعة جديدة' : 'Create Group'}
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreateGroup}
          className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4"
        >
          <h2 className="font-bold text-base">
            {lang === 'ar' ? 'تفاصيل المجموعة الجديدة' : 'New Group Details'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={100}
              placeholder={lang === 'ar' ? 'اسم المجموعة...' : 'Group name...'}
              className="px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm focus:outline-none focus:border-orange-500"
            />
            <select
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value as 'public' | 'private')}
              className="px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm focus:outline-none focus:border-orange-500"
            >
              <option value="public">{lang === 'ar' ? 'عامة — يمكن لأي شخص الانضمام' : 'Public — Anyone can join'}</option>
              <option value="private">
                {lang === 'ar' ? 'خاصة — تتطلب موافقة المشرف' : 'Private — Approval required'}
              </option>
            </select>
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={600}
            placeholder={lang === 'ar' ? 'وصف المجموعة وأهدافها...' : 'Describe your community...'}
            className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm focus:outline-none focus:border-orange-500"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold inline-flex items-center gap-2 hover:border-orange-500 cursor-pointer">
              <ImageIcon className="w-4 h-4 text-orange-500" />
              {uploadingCover
                ? lang === 'ar'
                  ? 'جارٍ الرفع...'
                  : 'Uploading...'
                : lang === 'ar'
                ? 'صورة غلاف المجموعة'
                : 'Upload Cover Photo'}
              <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
            </label>

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
                {creating ? '...' : lang === 'ar' ? 'إنشاء المجموعة' : 'Create Group'}
              </button>
            </div>
          </div>
        </form>
      )}

      {filteredGroups.length === 0 ? (
        <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center space-y-2">
          <Users2 className="w-8 h-8 mx-auto text-orange-500 opacity-75" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {lang === 'ar' ? 'لا توجد مجموعات بعد. أنشئ أول مجموعة على TIGER.' : 'No groups yet. Create the first TIGER community.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredGroups.map((group) => (
            <div
              key={group.id}
              onClick={() => setSelectedGroupId(group.id)}
              className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden hover:border-orange-500/50 transition-colors cursor-pointer flex flex-col"
            >
              <div className="h-32 bg-zinc-900 relative">
                <img
                  src={group.coverUrl || TIGER_ASSETS.coverStudio}
                  alt={group.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                <div>
                  <h3 className="font-bold text-base truncate">{group.name}</h3>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-1.5 tabular-nums">
                    {group.privacy === 'private' ? (
                      <Lock className="w-3 h-3 text-orange-500" />
                    ) : (
                      <Globe className="w-3 h-3 text-orange-500" />
                    )}
                    <span>
                      {group.privacy === 'private'
                        ? lang === 'ar'
                          ? 'خاصة'
                          : 'Private'
                        : lang === 'ar'
                        ? 'عامة'
                        : 'Public'}
                    </span>
                    <span>·</span>
                    <span>
                      {group.membersCount || 1} {lang === 'ar' ? 'عضو' : 'members'}
                    </span>
                  </div>
                  {group.description && (
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-2 line-clamp-2">{group.description}</p>
                  )}
                </div>
                <div className="text-xs font-semibold text-orange-500">
                  {lang === 'ar' ? 'فتح المجموعة ←' : 'Open Group →'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
