import React, { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import {
  UserPlus,
  UserCheck,
  UserMinus,
  UserX,
  MessageCircle,
  Search,
  ShieldBan,
  Check,
  X,
  Users,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useTiger } from '../context/TigerContext';
import { TigerAvatar } from './StatusViews';
import { PublicProfile } from '../types/tiger';

interface FriendRequestDoc {
  id: string;
  fromUid: string;
  toUid: string;
  fromName: string;
  fromAvatar?: string;
  status: 'pending' | 'accepted' | 'rejected';
}

interface FriendshipDoc {
  id: string;
  uidA: string;
  uidB: string;
}

interface FollowDoc {
  id: string;
  followerUid: string;
  targetUid: string;
}

interface BlockDoc {
  id: string;
  blockerUid: string;
  blockedUid: string;
}

export function FriendsModule() {
  const {
    firebaseUser,
    profile,
    profilesMap,
    onlineUids,
    lang,
    globalSearch,
    notifyUser,
    pushToast,
    openUserProfile,
    openDirectChatWith,
  } = useTiger();

  const [tab, setTab] = useState<'discover' | 'friends' | 'requests' | 'following' | 'blocked'>('discover');
  const [localSearch, setLocalSearch] = useState('');
  const [incomingReqs, setIncomingReqs] = useState<FriendRequestDoc[]>([]);
  const [outgoingReqs, setOutgoingReqs] = useState<FriendRequestDoc[]>([]);
  const [friendshipsA, setFriendshipsA] = useState<FriendshipDoc[]>([]);
  const [friendshipsB, setFriendshipsB] = useState<FriendshipDoc[]>([]);
  const [followingDocs, setFollowingDocs] = useState<FollowDoc[]>([]);
  const [followerDocs, setFollowerDocs] = useState<FollowDoc[]>([]);
  const [blocks, setBlocks] = useState<BlockDoc[]>([]);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const uid = firebaseUser?.uid;

  useEffect(() => {
    if (!uid) return;

    const u1 = onSnapshot(
      query(collection(db, 'friendRequests'), where('toUid', '==', uid)),
      (snap) => {
        setIncomingReqs(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<FriendRequestDoc, 'id'>) }))
            .filter((r) => r.status === 'pending')
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'friendRequests(to)')
    );

    const u2 = onSnapshot(
      query(collection(db, 'friendRequests'), where('fromUid', '==', uid)),
      (snap) => {
        setOutgoingReqs(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<FriendRequestDoc, 'id'>) }))
            .filter((r) => r.status === 'pending')
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'friendRequests(from)')
    );

    const u3 = onSnapshot(
      query(collection(db, 'friendships'), where('uidA', '==', uid)),
      (snap) => setFriendshipsA(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FriendshipDoc, 'id'>) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'friendships(A)')
    );

    const u4 = onSnapshot(
      query(collection(db, 'friendships'), where('uidB', '==', uid)),
      (snap) => setFriendshipsB(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FriendshipDoc, 'id'>) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'friendships(B)')
    );

    const u5 = onSnapshot(
      query(collection(db, 'follows'), where('followerUid', '==', uid)),
      (snap) => setFollowingDocs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FollowDoc, 'id'>) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'follows(following)')
    );

    const u6 = onSnapshot(
      query(collection(db, 'follows'), where('targetUid', '==', uid)),
      (snap) => setFollowerDocs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FollowDoc, 'id'>) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'follows(followers)')
    );

    const u7 = onSnapshot(
      query(collection(db, 'blocks'), where('blockerUid', '==', uid)),
      (snap) => setBlocks(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BlockDoc, 'id'>) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'blocks')
    );

    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
      u6();
      u7();
    };
  }, [uid]);

  if (!firebaseUser || !profile) return null;

  const friendUids = new Set<string>();
  const friendshipIdByOther: Record<string, string> = {};
  [...friendshipsA, ...friendshipsB].forEach((f) => {
    const other = f.uidA === firebaseUser.uid ? f.uidB : f.uidA;
    friendUids.add(other);
    friendshipIdByOther[other] = f.id;
  });

  const followingSet = new Set(followingDocs.map((f) => f.targetUid));
  const blockedSet = new Set(blocks.map((b) => b.blockedUid));
  const outgoingMap: Record<string, FriendRequestDoc> = {};
  outgoingReqs.forEach((r) => (outgoingMap[r.toUid] = r));
  const incomingMap: Record<string, FriendRequestDoc> = {};
  incomingReqs.forEach((r) => (incomingMap[r.fromUid] = r));

  const queryText = (localSearch || globalSearch).trim().toLowerCase();

  const allOtherProfiles = Object.values(profilesMap).filter((p) => {
    if (p.uid === firebaseUser.uid) return false;
    if (queryText) {
      return (
        p.displayName.toLowerCase().includes(queryText) ||
        p.username.toLowerCase().includes(queryText) ||
        (p.bio || '').toLowerCase().includes(queryText)
      );
    }
    return true;
  });

  const discoverList = allOtherProfiles.filter((p) => !blockedSet.has(p.uid));
  const friendsList = allOtherProfiles.filter((p) => friendUids.has(p.uid) && !blockedSet.has(p.uid));
  const onlineFriends = friendsList.filter((p) => onlineUids.has(p.uid));
  const followingList = allOtherProfiles.filter((p) => followingSet.has(p.uid) && !blockedSet.has(p.uid));
  const blockedList = blocks
    .map((b) => ({ block: b, profile: profilesMap[b.blockedUid] }))
    .filter((item) => item.profile || item.block.blockedUid);

  const sendFriendRequest = async (target: PublicProfile) => {
    setBusyUid(target.uid);
    const reqId = `${firebaseUser.uid}_${target.uid}`;
    try {
      await setDoc(doc(db, 'friendRequests', reqId), {
        fromUid: firebaseUser.uid,
        toUid: target.uid,
        fromName: profile.displayName,
        fromAvatar: profile.avatarUrl || '',
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      await notifyUser({
        recipientUid: target.uid,
        type: 'friend_request',
        message: lang === 'ar' ? 'أرسل لك طلب صداقة جديد' : 'sent you a friend request',
        targetId: reqId,
      });
      pushToast(lang === 'ar' ? 'تم إرسال طلب الصداقة' : 'Friend request sent', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `friendRequests/${reqId}`);
    } finally {
      setBusyUid(null);
    }
  };

  const cancelFriendRequest = async (reqId: string, otherUid: string) => {
    setBusyUid(otherUid);
    try {
      await deleteDoc(doc(db, 'friendRequests', reqId));
      pushToast(lang === 'ar' ? 'تم إلغاء الطلب' : 'Request cancelled', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `friendRequests/${reqId}`);
    } finally {
      setBusyUid(null);
    }
  };

  const acceptRequest = async (req: FriendRequestDoc) => {
    setBusyUid(req.fromUid);
    const [uidA, uidB] = [req.fromUid, firebaseUser.uid].sort();
    const fsId = `${uidA}_${uidB}`;
    try {
      await updateDoc(doc(db, 'friendRequests', req.id), {
        status: 'accepted',
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'friendships', fsId), {
        uidA,
        uidB,
        createdAt: serverTimestamp(),
      });
      await Promise.all([
        updateDoc(doc(db, 'publicProfiles', firebaseUser.uid), {
          friendsCount: increment(1),
          updatedAt: serverTimestamp(),
        }).catch(() => {}),
        updateDoc(doc(db, 'publicProfiles', req.fromUid), {
          friendsCount: increment(1),
          updatedAt: serverTimestamp(),
        }).catch(() => {}),
      ]);
      await notifyUser({
        recipientUid: req.fromUid,
        type: 'friend_request',
        message: lang === 'ar' ? 'وافق على طلب صداقتك' : 'accepted your friend request',
        targetId: fsId,
      });
      pushToast(lang === 'ar' ? 'أصبحتما صديقين الآن' : 'You are now friends', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `friendships/${fsId}`);
    } finally {
      setBusyUid(null);
    }
  };

  const rejectRequest = async (req: FriendRequestDoc) => {
    setBusyUid(req.fromUid);
    try {
      await updateDoc(doc(db, 'friendRequests', req.id), {
        status: 'rejected',
        updatedAt: serverTimestamp(),
      });
      pushToast(lang === 'ar' ? 'تم رفض الطلب' : 'Request declined', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `friendRequests/${req.id}`);
    } finally {
      setBusyUid(null);
    }
  };

  const unfriend = async (otherUid: string) => {
    const fsId = friendshipIdByOther[otherUid];
    if (!fsId) return;
    setBusyUid(otherUid);
    try {
      await deleteDoc(doc(db, 'friendships', fsId));
      const myCount = Math.max(0, (profile.friendsCount || 1) - 1);
      const otherCount = Math.max(0, (profilesMap[otherUid]?.friendsCount || 1) - 1);
      await Promise.all([
        updateDoc(doc(db, 'publicProfiles', firebaseUser.uid), {
          friendsCount: myCount,
          updatedAt: serverTimestamp(),
        }).catch(() => {}),
        updateDoc(doc(db, 'publicProfiles', otherUid), {
          friendsCount: otherCount,
          updatedAt: serverTimestamp(),
        }).catch(() => {}),
      ]);
      pushToast(lang === 'ar' ? 'تم إلغاء الصداقة' : 'Removed from friends', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `friendships/${fsId}`);
    } finally {
      setBusyUid(null);
    }
  };

  const toggleFollow = async (target: PublicProfile) => {
    setBusyUid(target.uid);
    const followId = `${firebaseUser.uid}_${target.uid}`;
    const isFollowing = followingSet.has(target.uid);
    try {
      if (isFollowing) {
        await deleteDoc(doc(db, 'follows', followId));
        const nextCount = Math.max(0, (target.followersCount || 1) - 1);
        await updateDoc(doc(db, 'publicProfiles', target.uid), {
          followersCount: nextCount,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
        pushToast(lang === 'ar' ? 'تم إلغاء المتابعة' : 'Unfollowed', 'info');
      } else {
        await setDoc(doc(db, 'follows', followId), {
          followerUid: firebaseUser.uid,
          targetUid: target.uid,
          createdAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'publicProfiles', target.uid), {
          followersCount: increment(1),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
        await notifyUser({
          recipientUid: target.uid,
          type: 'follow',
          message: lang === 'ar' ? 'بدأ بمتابعتك على TIGER' : 'started following you on TIGER',
          targetId: firebaseUser.uid,
        });
        pushToast(lang === 'ar' ? 'تمت المتابعة بنجاح' : 'Now following', 'success');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `follows/${followId}`);
    } finally {
      setBusyUid(null);
    }
  };

  const blockUser = async (otherUid: string) => {
    setBusyUid(otherUid);
    const blockId = `${firebaseUser.uid}_${otherUid}`;
    try {
      await setDoc(doc(db, 'blocks', blockId), {
        blockerUid: firebaseUser.uid,
        blockedUid: otherUid,
        createdAt: serverTimestamp(),
      });
      if (friendshipIdByOther[otherUid]) {
        await deleteDoc(doc(db, 'friendships', friendshipIdByOther[otherUid])).catch(() => {});
      }
      if (followingSet.has(otherUid)) {
        await deleteDoc(doc(db, 'follows', `${firebaseUser.uid}_${otherUid}`)).catch(() => {});
      }
      pushToast(lang === 'ar' ? 'تم حظر المستخدم' : 'User blocked', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `blocks/${blockId}`);
    } finally {
      setBusyUid(null);
    }
  };

  const unblockUser = async (blockId: string, otherUid: string) => {
    setBusyUid(otherUid);
    try {
      await deleteDoc(doc(db, 'blocks', blockId));
      pushToast(lang === 'ar' ? 'تم إلغاء الحظر' : 'User unblocked', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `blocks/${blockId}`);
    } finally {
      setBusyUid(null);
    }
  };

  const renderPersonCard = (person: PublicProfile) => {
    const isFriend = friendUids.has(person.uid);
    const isFollowing = followingSet.has(person.uid);
    const outgoing = outgoingMap[person.uid];
    const incoming = incomingMap[person.uid];
    const isOnline = onlineUids.has(person.uid);
    const isBusy = busyUid === person.uid;

    return (
      <div
        key={person.uid}
        className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col justify-between gap-4 hover:border-orange-500/40 transition-colors"
      >
        <div className="flex items-start gap-3">
          <button
            onClick={() => openUserProfile(person.uid)}
            className="shrink-0 cursor-pointer"
          >
            <TigerAvatar src={person.avatarUrl} name={person.displayName} size="lg" online={isOnline} />
          </button>
          <div className="min-w-0 flex-1">
            <button
              onClick={() => openUserProfile(person.uid)}
              className="flex items-center gap-1.5 font-bold text-sm hover:text-orange-500 transition-colors truncate max-w-full cursor-pointer"
            >
              <span className="truncate">{person.displayName}</span>
              {person.isVerified && <CheckCircle2 className="w-3.5 h-3.5 text-orange-500 shrink-0" />}
            </button>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
              @{person.username} ·{' '}
              <span className={isOnline ? 'text-emerald-500' : ''}>
                {isOnline ? (lang === 'ar' ? 'متصل الآن' : 'Online') : lang === 'ar' ? 'غير متصل' : 'Offline'}
              </span>
            </div>
            {person.bio && (
              <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">{person.bio}</p>
            )}
            <div className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
              {person.friendsCount || 0} {lang === 'ar' ? 'أصدقاء' : 'friends'} · {person.followersCount || 0}{' '}
              {lang === 'ar' ? 'متابع' : 'followers'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
          {isFriend ? (
            <button
              disabled={isBusy}
              onClick={() => unfriend(person.uid)}
              className="flex-1 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-red-500/10 hover:text-red-500 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <UserMinus className="w-3.5 h-3.5" />
              {lang === 'ar' ? 'إلغاء الصداقة' : 'Unfriend'}
            </button>
          ) : incoming ? (
            <button
              disabled={isBusy}
              onClick={() => acceptRequest(incoming)}
              className="flex-1 px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              {lang === 'ar' ? 'قبول الطلب' : 'Accept'}
            </button>
          ) : outgoing ? (
            <button
              disabled={isBusy}
              onClick={() => cancelFriendRequest(outgoing.id, person.uid)}
              className="flex-1 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              {lang === 'ar' ? 'إلغاء الطلب' : 'Pending'}
            </button>
          ) : (
            <button
              disabled={isBusy}
              onClick={() => sendFriendRequest(person)}
              className="flex-1 px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              {lang === 'ar' ? 'إضافة صديق' : 'Add Friend'}
            </button>
          )}

          <button
            disabled={isBusy}
            onClick={() => toggleFollow(person)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
              isFollowing
                ? 'border-orange-500/40 bg-orange-500/10 text-orange-500'
                : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            {isFollowing ? (lang === 'ar' ? 'متابَع' : 'Following') : lang === 'ar' ? 'متابعة' : 'Follow'}
          </button>

          <button
            onClick={() => openDirectChatWith(person.uid)}
            title={lang === 'ar' ? 'مراسلة' : 'Message'}
            className="p-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-orange-500/50 hover:text-orange-500 transition-colors cursor-pointer"
          >
            <MessageCircle className="w-4 h-4" />
          </button>

          <button
            disabled={isBusy}
            onClick={() => blockUser(person.uid)}
            title={lang === 'ar' ? 'حظر' : 'Block'}
            className="p-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-red-500/50 hover:text-red-500 transition-colors cursor-pointer"
          >
            <ShieldBan className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight flex items-center gap-2.5">
            <Users className="w-6 h-6 text-orange-500" />
            {lang === 'ar' ? 'أصدقاء TIGER والشبكة' : 'TIGER Friends & Network'}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 tabular-nums">
            {friendsList.length} {lang === 'ar' ? 'أصدقاء' : 'friends'} · {followerDocs.length}{' '}
            {lang === 'ar' ? 'متابعين لك' : 'followers'} · {onlineFriends.length}{' '}
            {lang === 'ar' ? 'متصل الآن' : 'online now'}
          </p>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-zinc-400 absolute top-1/2 -translate-y-1/2 start-3.5" />
          <input
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder={lang === 'ar' ? 'ابحث بالاسم أو @المعرف...' : 'Search by name or @handle...'}
            className="w-full ps-10 pe-4 py-2 rounded-xl bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 text-sm focus:outline-none focus:border-orange-500"
          />
        </div>
      </div>

      {/* Online Friends Quick Strip */}
      {onlineFriends.length > 0 && (
        <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
            {lang === 'ar' ? 'الأصدقاء المتصلون الآن' : 'Online Friends Right Now'} ({onlineFriends.length})
          </div>
          <div className="flex items-center gap-4 overflow-x-auto pb-1">
            {onlineFriends.map((friend) => (
              <button
                key={friend.uid}
                onClick={() => openDirectChatWith(friend.uid)}
                className="flex flex-col items-center gap-1.5 shrink-0 group cursor-pointer"
              >
                <TigerAvatar src={friend.avatarUrl} name={friend.displayName} size="md" online />
                <span className="text-xs font-medium max-w-[76px] truncate group-hover:text-orange-500">
                  {friend.displayName}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
        {(
          [
            { id: 'discover', ar: 'اكتشاف الأعضاء', en: 'Discover', count: discoverList.length },
            { id: 'friends', ar: 'أصدقائي', en: 'My Friends', count: friendsList.length },
            { id: 'requests', ar: 'طلبات الصداقة', en: 'Requests', count: incomingReqs.length },
            { id: 'following', ar: 'أتابعهم', en: 'Following', count: followingList.length },
            { id: 'blocked', ar: 'المحظورون', en: 'Blocked', count: blocks.length },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-2 ${
              tab === item.id
                ? 'bg-orange-500 text-white'
                : 'bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-orange-500/40'
            }`}
          >
            <span>{lang === 'ar' ? item.ar : item.en}</span>
            <span className="tabular-nums opacity-80">{item.count}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'requests' ? (
        <div className="space-y-4">
          {incomingReqs.length === 0 ? (
            <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
              {lang === 'ar' ? 'لا توجد طلبات صداقة واردة حالياً.' : 'No pending incoming friend requests.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {incomingReqs.map((req) => {
                const sender = profilesMap[req.fromUid];
                return (
                  <div
                    key={req.id}
                    className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex items-center justify-between gap-3"
                  >
                    <button
                      onClick={() => openUserProfile(req.fromUid)}
                      className="flex items-center gap-3 min-w-0 text-start cursor-pointer"
                    >
                      <TigerAvatar
                        src={sender?.avatarUrl || req.fromAvatar}
                        name={sender?.displayName || req.fromName}
                        size="md"
                        online={onlineUids.has(req.fromUid)}
                      />
                      <div className="min-w-0">
                        <div className="font-bold text-sm truncate">{sender?.displayName || req.fromName}</div>
                        <div className="text-xs text-zinc-500 truncate">
                          @{sender?.username || req.fromUid.slice(0, 8)}
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        disabled={busyUid === req.fromUid}
                        onClick={() => acceptRequest(req)}
                        className="px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        {lang === 'ar' ? 'قبول' : 'Accept'}
                      </button>
                      <button
                        disabled={busyUid === req.fromUid}
                        onClick={() => rejectRequest(req)}
                        className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-red-500/10 hover:text-red-500 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        {lang === 'ar' ? 'رفض' : 'Decline'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : tab === 'blocked' ? (
        blockedList.length === 0 ? (
          <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
            {lang === 'ar' ? 'قائمة المحظورين فارغة.' : 'You have not blocked any accounts.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {blockedList.map(({ block, profile: bp }) => (
              <div
                key={block.id}
                className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <TigerAvatar src={bp?.avatarUrl} name={bp?.displayName || block.blockedUid} size="md" />
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">{bp?.displayName || block.blockedUid}</div>
                    <div className="text-xs text-zinc-500 truncate">@{bp?.username || 'blocked'}</div>
                  </div>
                </div>
                <button
                  disabled={busyUid === block.blockedUid}
                  onClick={() => unblockUser(block.id, block.blockedUid)}
                  className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-orange-500 hover:text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <UserX className="w-3.5 h-3.5" />
                  {lang === 'ar' ? 'إلغاء الحظر' : 'Unblock'}
                </button>
              </div>
            ))}
          </div>
        )
      ) : (
        (() => {
          const list = tab === 'friends' ? friendsList : tab === 'following' ? followingList : discoverList;
          if (list.length === 0) {
            return (
              <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-10 text-center space-y-2">
                <Sparkles className="w-7 h-7 mx-auto text-orange-500 opacity-75" />
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {tab === 'friends'
                    ? lang === 'ar'
                      ? 'لا يوجد أصدقاء بعد. استكشف الأعضاء وأرسل طلبات صداقة.'
                      : 'No friends yet. Explore members in Discover to connect.'
                    : lang === 'ar'
                    ? 'لم يتم العثور على أعضاء مطابقين.'
                    : 'No matching TIGER members found.'}
                </p>
              </div>
            );
          }
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {list.map(renderPersonCard)}
            </div>
          );
        })()
      )}
    </div>
  );
}
