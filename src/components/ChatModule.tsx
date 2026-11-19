import React, { useEffect, useState, useRef } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  Send,
  Paperclip,
  Mic,
  Square,
  Phone,
  Video,
  MapPin,
  Shield,
  Pin,
  Archive,
  BellOff,
  Reply,
  Edit3,
  Trash2,
  Forward,
  Plus,
  X,
  Search,
  PhoneOff,
  CheckCheck,
  FileText,
  Users,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useTiger } from '../context/TigerContext';
import { ChatItem, ChatMessageItem } from '../types/tiger';
import { uploadPublicMedia, formatTimeAgo } from '../lib/upload';
import {
  encryptMessageText,
  decryptMessageText,
  getKeyFingerprint,
  isEncryptedPayload,
} from '../lib/crypto';
import { TigerAvatar } from './StatusViews';

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export function ChatModule() {
  const {
    firebaseUser,
    profile,
    profilesMap,
    onlineUids,
    lang,
    t,
    sendWs,
    subscribeWs,
    pushToast,
    activeChatId,
    notifyUser,
  } = useTiger();

  const [chats, setChats] = useState<ChatItem[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(activeChatId);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [decryptedMap, setDecryptedMap] = useState<Record<string, string>>({});
  const [fingerprint, setFingerprint] = useState('');

  const [chatSearch, setChatSearch] = useState('');
  const [chatFilter, setChatFilter] = useState<'all' | 'pinned' | 'archived'>('all');
  const [messageText, setMessageText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessageItem | null>(null);
  const [editingMsg, setEditingMsg] = useState<ChatMessageItem | null>(null);
  const [forwardingMsg, setForwardingMsg] = useState<ChatMessageItem | null>(null);
  const [typingUser, setTypingUser] = useState<string>('');
  const [uploading, setUploading] = useState(false);

  // Voice Note recording
  const [recordingVoice, setRecordingVoice] = useState(false);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);

  // New Chat modal
  const [showNewModal, setShowNewModal] = useState<'direct' | 'group' | null>(null);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  // WebRTC Call state
  const [callState, setCallState] = useState<{
    active: boolean;
    incoming: boolean;
    mode: 'audio' | 'video';
    peerUid: string;
    peerName: string;
    offer?: RTCSessionDescriptionInit;
  } | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (activeChatId) setSelectedChatId(activeChatId);
  }, [activeChatId]);

  // Subscribe to user's chats
  useEffect(() => {
    if (!firebaseUser) return;
    const q = query(
      collection(db, 'chats'),
      where('participantUids', 'array-contains', firebaseUser.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<ChatItem, 'id'>) }))
          .sort(
            (a, b) =>
              (b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0) -
              (a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0)
          );
        setChats(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'chats')
    );
    return () => unsub();
  }, [firebaseUser]);

  const activeChat = chats.find((c) => c.id === selectedChatId) || null;

  // Compute Web Crypto fingerprint for active chat
  useEffect(() => {
    if (!activeChat) {
      setFingerprint('');
      return;
    }
    getKeyFingerprint(activeChat.id).then(setFingerprint).catch(() => {});
  }, [activeChat?.id]);

  // Subscribe to messages for active chat
  useEffect(() => {
    if (!firebaseUser || !activeChat) {
      setMessages([]);
      return;
    }
    const q = query(
      collection(db, 'chats', activeChat.id, 'messages'),
      where('participantUids', 'array-contains', firebaseUser.uid)
    );
    const unsub = onSnapshot(
      q,
      async (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessageItem, 'id'>) }))
          .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
        setMessages(list);

        // Decrypt any E2EE payloads locally
        const map: Record<string, string> = {};
        for (const m of list) {
          if (isEncryptedPayload(m.text)) {
            map[m.id] = await decryptMessageText(activeChat.id, m.text);
          }
        }
        setDecryptedMap(map);
        window.setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `chats/${activeChat.id}/messages`)
    );
    return () => unsub();
  }, [firebaseUser, activeChat?.id]);

  // WebSocket listener for typing + WebRTC call signaling
  useEffect(() => {
    const unsub = subscribeWs(async (msg) => {
      if (msg.type === 'chat:typing' && msg.chatId === selectedChatId) {
        setTypingUser(msg.isTyping ? String(msg.fromName || '') : '');
      }

      if (msg.type === 'webrtc:call-request') {
        setCallState({
          active: false,
          incoming: true,
          mode: msg.mode === 'video' ? 'video' : 'audio',
          peerUid: String(msg.fromUid || ''),
          peerName: String(msg.fromName || 'User'),
          offer: msg.offer as RTCSessionDescriptionInit,
        });
      }

      if (msg.type === 'webrtc:answer' && pcRef.current && msg.answer) {
        await pcRef.current.setRemoteDescription(
          new RTCSessionDescription(msg.answer as RTCSessionDescriptionInit)
        );
      }

      if (msg.type === 'webrtc:ice-candidate' && pcRef.current && msg.candidate) {
        try {
          await pcRef.current.addIceCandidate(
            new RTCIceCandidate(msg.candidate as RTCIceCandidateInit)
          );
        } catch {
          // ignore race
        }
      }

      if (msg.type === 'webrtc:call-end') {
        cleanupCall();
        pushToast(lang === 'ar' ? 'انتهت المكالمة' : 'Call ended', 'info');
      }
    });
    return unsub;
  }, [selectedChatId, subscribeWs, lang, pushToast]);

  const cleanupCall = () => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    localStreamRef.current = null;
    setCallState(null);
  };

  const startCall = async (mode: 'audio' | 'video') => {
    if (!activeChat || !firebaseUser) return;
    const peerUid = activeChat.participantUids.find((u) => u !== firebaseUser.uid);
    if (!peerUid) {
      pushToast(lang === 'ar' ? 'لا يوجد طرف آخر في هذه المحادثة' : 'No peer in this chat', 'error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: mode === 'video',
      });
      localStreamRef.current = stream;
      const pc = new RTCPeerConnection(ICE_CONFIG);
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendWs({ type: 'webrtc:ice-candidate', targetUid: peerUid, candidate: e.candidate });
        }
      };
      pc.ontrack = (e) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = e.streams[0];
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      setCallState({
        active: true,
        incoming: false,
        mode,
        peerUid,
        peerName: profilesMap[peerUid]?.displayName || 'Peer',
      });

      window.setTimeout(() => {
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      }, 100);

      sendWs({
        type: 'webrtc:call-request',
        targetUid: peerUid,
        mode,
        offer,
      });
    } catch (err) {
      pushToast(
        lang === 'ar'
          ? 'تعذر الوصول للميكروفون أو الكاميرا.'
          : `Media access error: ${err instanceof Error ? err.message : ''}`,
        'error'
      );
    }
  };

  const acceptIncomingCall = async () => {
    if (!callState || !callState.offer) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callState.mode === 'video',
      });
      localStreamRef.current = stream;
      const pc = new RTCPeerConnection(ICE_CONFIG);
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendWs({
            type: 'webrtc:ice-candidate',
            targetUid: callState.peerUid,
            candidate: e.candidate,
          });
        }
      };
      pc.ontrack = (e) => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
      };

      await pc.setRemoteDescription(new RTCSessionDescription(callState.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      sendWs({
        type: 'webrtc:answer',
        targetUid: callState.peerUid,
        answer,
      });

      setCallState({ ...callState, active: true, incoming: false });
      window.setTimeout(() => {
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      }, 100);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to answer call', 'error');
      cleanupCall();
    }
  };

  const endCall = () => {
    if (callState) {
      sendWs({ type: 'webrtc:call-end', targetUid: callState.peerUid });
    }
    cleanupCall();
  };

  const getChatDisplayName = (chat: ChatItem): string => {
    if (chat.type === 'group') return chat.name || 'Group Chat';
    const otherUid = chat.participantUids.find((u) => u !== firebaseUser?.uid);
    return (otherUid && profilesMap[otherUid]?.displayName) || chat.name || 'Direct Chat';
  };

  const getChatOtherUid = (chat: ChatItem): string | undefined =>
    chat.type === 'direct' ? chat.participantUids.find((u) => u !== firebaseUser?.uid) : undefined;

  const sendMessage = async (opts?: {
    mediaUrl?: string;
    mediaType?: string;
    fileName?: string;
    location?: string;
    overrideText?: string;
    isForwarded?: boolean;
    targetChat?: ChatItem;
  }) => {
    const target = opts?.targetChat || activeChat;
    if (!firebaseUser || !profile || !target) return;

    const rawText = (opts?.overrideText ?? messageText).trim();
    if (!rawText && !opts?.mediaUrl && !opts?.location) return;

    try {
      if (editingMsg && !opts?.targetChat) {
        const finalEdit = target.e2eeEnabled
          ? await encryptMessageText(target.id, rawText)
          : rawText;
        await updateDoc(doc(db, 'chats', target.id, 'messages', editingMsg.id), {
          text: finalEdit,
          isEdited: true,
        });
        setEditingMsg(null);
        setMessageText('');
        return;
      }

      const storedText =
        rawText && target.e2eeEnabled ? await encryptMessageText(target.id, rawText) : rawText;

      await addDoc(collection(db, 'chats', target.id, 'messages'), {
        chatId: target.id,
        senderUid: firebaseUser.uid,
        senderName: profile.displayName,
        participantUids: target.participantUids,
        text: storedText.slice(0, 3900),
        mediaUrl: opts?.mediaUrl || '',
        mediaType: opts?.mediaType || '',
        fileName: opts?.fileName || '',
        location: opts?.location || '',
        replyToId: replyTo?.id || '',
        replyToPreview: replyTo
          ? (decryptedMap[replyTo.id] || replyTo.text || replyTo.fileName || '').slice(0, 120)
          : '',
        isForwarded: Boolean(opts?.isForwarded),
        isEdited: false,
        isDeleted: false,
        reaction: '',
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'chats', target.id), {
        lastMessageText: target.e2eeEnabled
          ? '🔒 Encrypted message'
          : (rawText || opts?.fileName || opts?.location || 'Media').slice(0, 300),
        lastMessageSenderUid: firebaseUser.uid,
        updatedAt: serverTimestamp(),
      });

      for (const uid of target.participantUids) {
        if (uid !== firebaseUser.uid) {
          await notifyUser({
            recipientUid: uid,
            type: 'message',
            targetId: target.id,
            message: target.e2eeEnabled
              ? lang === 'ar'
                ? 'أرسل رسالة مشفرة'
                : 'sent an encrypted message'
              : (rawText || opts?.fileName || 'New message').slice(0, 80),
          });
        }
      }

      if (!opts?.targetChat) {
        setMessageText('');
        setReplyTo(null);
        sendWs({
          type: 'chat:typing',
          chatId: target.id,
          participantUids: target.participantUids,
          isTyping: false,
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `chats/${target.id}/messages`);
    }
  };

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChat) return;
    setUploading(true);
    try {
      const up = await uploadPublicMedia(file);
      const mType = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('video/')
        ? 'video'
        : file.type.startsWith('audio/')
        ? 'audio'
        : 'file';
      await sendMessage({
        mediaUrl: up.url,
        mediaType: mType,
        fileName: up.fileName,
        overrideText: '',
      });
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const toggleVoiceRecording = async () => {
    if (recordingVoice) {
      voiceRecorderRef.current?.stop();
      setRecordingVoice(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceChunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) voiceChunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(voiceChunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
        try {
          const up = await uploadPublicMedia(file);
          await sendMessage({
            mediaUrl: up.url,
            mediaType: 'audio',
            fileName: file.name,
            overrideText: '',
          });
        } catch (err) {
          pushToast(err instanceof Error ? err.message : 'Voice note upload failed', 'error');
        }
      };
      rec.start();
      voiceRecorderRef.current = rec;
      setRecordingVoice(true);
    } catch {
      pushToast(
        lang === 'ar' ? 'يرجى السماح بالوصول للميكروفون' : 'Microphone permission denied',
        'error'
      );
    }
  };

  const shareCurrentLocation = () => {
    if (!navigator.geolocation) {
      pushToast('Geolocation not supported', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
        sendMessage({ location: coords, overrideText: '' });
      },
      () => {
        pushToast(
          lang === 'ar' ? 'تعذر تحديد الموقع الجغرافي' : 'Location permission denied',
          'error'
        );
      }
    );
  };

  const toggleChatFlag = async (field: 'pinnedBy' | 'archivedBy' | 'mutedBy') => {
    if (!activeChat || !firebaseUser) return;
    const current = activeChat[field] || [];
    const next = current.includes(firebaseUser.uid)
      ? current.filter((u) => u !== firebaseUser.uid)
      : [...current, firebaseUser.uid];
    await updateDoc(doc(db, 'chats', activeChat.id), { [field]: next, updatedAt: serverTimestamp() });
  };

  const toggleE2ee = async () => {
    if (!activeChat) return;
    await updateDoc(doc(db, 'chats', activeChat.id), {
      e2eeEnabled: !activeChat.e2eeEnabled,
      updatedAt: serverTimestamp(),
    });
    pushToast(
      !activeChat.e2eeEnabled
        ? lang === 'ar'
          ? 'تم تفعيل تشفير Web Crypto (AES-GCM 256) لهذه المحادثة'
          : 'Web Crypto AES-GCM encryption enabled for this chat'
        : lang === 'ar'
        ? 'تم إيقاف تشفير الجلسة'
        : 'Session encryption disabled',
      'info'
    );
  };

  const createNewChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || selectedMembers.length === 0) return;

    if (showNewModal === 'direct') {
      const otherUid = selectedMembers[0];
      const pairId = [firebaseUser.uid, otherUid].sort().join('_');
      const chatId = `dm_${pairId}`;
      await setDoc(
        doc(db, 'chats', chatId),
        {
          type: 'direct',
          name: profilesMap[otherUid]?.displayName || 'Direct Chat',
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
        },
        { merge: true }
      );
      setSelectedChatId(chatId);
    } else {
      const ref = await addDoc(collection(db, 'chats'), {
        type: 'group',
        name: (groupName.trim() || 'TIGER Group').slice(0, 90),
        ownerUid: firebaseUser.uid,
        participantUids: Array.from(new Set([firebaseUser.uid, ...selectedMembers])),
        lastMessageText: '',
        lastMessageSenderUid: '',
        e2eeEnabled: false,
        pinnedBy: [],
        archivedBy: [],
        mutedBy: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setSelectedChatId(ref.id);
    }

    setShowNewModal(null);
    setGroupName('');
    setSelectedMembers([]);
  };

  const visibleChats = chats.filter((c) => {
    const uid = firebaseUser?.uid || '';
    const isArchived = (c.archivedBy || []).includes(uid);
    const isPinned = (c.pinnedBy || []).includes(uid);
    if (chatFilter === 'archived' && !isArchived) return false;
    if (chatFilter === 'pinned' && !isPinned) return false;
    if (chatFilter === 'all' && isArchived) return false;
    if (chatSearch.trim()) {
      return getChatDisplayName(c).toLowerCase().includes(chatSearch.toLowerCase());
    }
    return true;
  });

  const otherUsers = Object.values(profilesMap).filter((p) => p.uid !== firebaseUser?.uid);

  return (
    <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[75vh]">
      {/* Chat List Sidebar */}
      <aside className="lg:col-span-4 border-b lg:border-b-0 lg:border-e border-zinc-200 dark:border-zinc-800 flex flex-col">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="font-display font-extrabold text-lg">{t.chat.title}</h1>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setSelectedMembers([]);
                  setShowNewModal('direct');
                }}
                title={t.chat.newDirect}
                className="p-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setSelectedMembers([]);
                  setShowNewModal('group');
                }}
                title={t.chat.newGroup}
                className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <Users className="w-4 h-4 text-orange-500" />
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              type="text"
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              placeholder={t.common.search}
              className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 ps-9 pe-3 py-2 text-xs focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="flex items-center gap-1 text-xs">
            {(
              [
                ['all', lang === 'ar' ? 'الكل' : 'All'],
                ['pinned', t.chat.pinned],
                ['archived', t.chat.archived],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                onClick={() => setChatFilter(k)}
                className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                  chatFilter === k
                    ? 'bg-orange-500 text-white'
                    : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
          {visibleChats.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-500">
              {lang === 'ar' ? 'لا توجد محادثات بعد. اضغط + لبدء محادثة.' : 'No conversations yet. Click + to start.'}
            </div>
          ) : (
            visibleChats.map((c) => {
              const otherUid = getChatOtherUid(c);
              const name = getChatDisplayName(c);
              const avatar = otherUid ? profilesMap[otherUid]?.avatarUrl : undefined;
              const isOnline = otherUid ? onlineUids.has(otherUid) : false;
              const isPinned = (c.pinnedBy || []).includes(firebaseUser?.uid || '');
              const isMuted = (c.mutedBy || []).includes(firebaseUser?.uid || '');
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedChatId(c.id)}
                  className={`w-full p-3.5 flex items-center gap-3 text-start transition-colors cursor-pointer ${
                    selectedChatId === c.id
                      ? 'bg-orange-500/10'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/60'
                  }`}
                >
                  <TigerAvatar src={avatar} name={name} size="md" online={isOnline} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm truncate">{name}</span>
                      <div className="flex items-center gap-1 text-zinc-400 shrink-0">
                        {isPinned && <Pin className="w-3 h-3 text-orange-500" />}
                        {isMuted && <BellOff className="w-3 h-3" />}
                        <span className="text-[10px]">
                          {formatTimeAgo(c.updatedAt?.toMillis?.() || c.createdAt?.toMillis?.(), lang)}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-zinc-500 truncate mt-0.5">
                      {c.lastMessageText || (lang === 'ar' ? 'ابدأ المحادثة...' : 'Start chatting...')}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Active Conversation Panel */}
      <section className="lg:col-span-8 flex flex-col h-[75vh]">
        {!activeChat ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3 text-zinc-500">
            <Shield className="w-10 h-10 text-orange-500/70" />
            <p className="text-sm font-medium">{t.chat.selectChat}</p>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <TigerAvatar
                  src={getChatOtherUid(activeChat) ? profilesMap[getChatOtherUid(activeChat)!]?.avatarUrl : undefined}
                  name={getChatDisplayName(activeChat)}
                  size="sm"
                  online={getChatOtherUid(activeChat) ? onlineUids.has(getChatOtherUid(activeChat)!) : false}
                />
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{getChatDisplayName(activeChat)}</div>
                  <div className="text-[11px] text-zinc-500 flex items-center gap-1.5">
                    {typingUser ? (
                      <span className="text-orange-500 font-semibold">
                        {typingUser} {lang === 'ar' ? 'يكتب الآن...' : 'is typing...'}
                      </span>
                    ) : getChatOtherUid(activeChat) && onlineUids.has(getChatOtherUid(activeChat)!) ? (
                      <span className="text-emerald-500">{t.common.online}</span>
                    ) : (
                      <span>
                        {activeChat.participantUids.length}{' '}
                        {lang === 'ar' ? 'أعضاء' : 'participants'}
                      </span>
                    )}
                    {activeChat.e2eeEnabled && fingerprint && (
                      <span className="text-orange-500 font-mono text-[10px]">
                        · AES-GCM {fingerprint.slice(0, 11)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => startCall('audio')}
                  title={t.chat.voiceCall}
                  className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 cursor-pointer"
                >
                  <Phone className="w-4 h-4" />
                </button>
                <button
                  onClick={() => startCall('video')}
                  title={t.chat.videoCall}
                  className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 cursor-pointer"
                >
                  <Video className="w-4 h-4" />
                </button>
                <button
                  onClick={toggleE2ee}
                  title={t.chat.e2eeTitle}
                  className={`p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer ${
                    activeChat.e2eeEnabled ? 'text-orange-500' : 'text-zinc-400'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                </button>
                <button
                  onClick={() => toggleChatFlag('pinnedBy')}
                  title={t.chat.pinned}
                  className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 cursor-pointer"
                >
                  <Pin className="w-4 h-4" />
                </button>
                <button
                  onClick={() => toggleChatFlag('archivedBy')}
                  title={t.chat.archived}
                  className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 cursor-pointer"
                >
                  <Archive className="w-4 h-4" />
                </button>
                <button
                  onClick={() => toggleChatFlag('mutedBy')}
                  title={t.chat.muted}
                  className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 cursor-pointer"
                >
                  <BellOff className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages Timeline */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m) => {
                const isMine = m.senderUid === firebaseUser?.uid;
                const displayText = decryptedMap[m.id] ?? m.text;
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 space-y-1.5 group relative ${
                        isMine
                          ? 'bg-orange-500 text-white'
                          : 'bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100'
                      }`}
                    >
                      {!isMine && (
                        <div className="text-[10px] font-bold text-orange-500">{m.senderName}</div>
                      )}
                      {m.isForwarded && (
                        <div className="text-[10px] opacity-75 italic">{t.chat.forwarded}</div>
                      )}
                      {m.replyToPreview && (
                        <div className="text-[11px] px-2 py-1 rounded-lg bg-black/15 border-s-2 border-white/60 truncate">
                          {m.replyToPreview}
                        </div>
                      )}

                      {m.isDeleted ? (
                        <p className="text-xs italic opacity-75">{t.chat.deleted}</p>
                      ) : (
                        <>
                          {m.mediaUrl && m.mediaType === 'image' && (
                            <img
                              src={m.mediaUrl}
                              alt={m.fileName || 'Image'}
                              referrerPolicy="no-referrer"
                              className="rounded-xl max-h-60 object-cover"
                            />
                          )}
                          {m.mediaUrl && m.mediaType === 'video' && (
                            <video src={m.mediaUrl} controls className="rounded-xl max-h-60" />
                          )}
                          {m.mediaUrl && m.mediaType === 'audio' && (
                            <audio src={m.mediaUrl} controls className="max-w-full" />
                          )}
                          {m.mediaUrl && m.mediaType === 'file' && (
                            <a
                              href={m.mediaUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2 text-xs underline"
                            >
                              <FileText className="w-4 h-4" /> {m.fileName || 'Attachment'}
                            </a>
                          )}
                          {m.location && (
                            <div className="flex items-center gap-1.5 text-xs font-mono">
                              <MapPin className="w-3.5 h-3.5" /> {m.location}
                            </div>
                          )}
                          {displayText && (
                            <p className="text-sm whitespace-pre-wrap break-words">{displayText}</p>
                          )}
                        </>
                      )}

                      <div className="flex items-center justify-end gap-1.5 text-[10px] opacity-75">
                        {m.reaction && <span className="text-sm">{m.reaction}</span>}
                        {m.isEdited && <span>{t.chat.edited}</span>}
                        <span>{formatTimeAgo(m.createdAt?.toMillis?.(), lang)}</span>
                        {isMine && <CheckCheck className="w-3 h-3" />}
                      </div>

                      {/* Quick message controls */}
                      {!m.isDeleted && (
                        <div className="flex items-center gap-1 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setReplyTo(m)}
                            title="Reply"
                            className="p-1 rounded bg-black/20 hover:bg-black/35 cursor-pointer"
                          >
                            <Reply className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setForwardingMsg(m)}
                            title="Forward"
                            className="p-1 rounded bg-black/20 hover:bg-black/35 cursor-pointer"
                          >
                            <Forward className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() =>
                              updateDoc(doc(db, 'chats', activeChat.id, 'messages', m.id), {
                                reaction: m.reaction === '❤️' ? '' : '❤️',
                              })
                            }
                            title="React"
                            className="p-1 rounded bg-black/20 hover:bg-black/35 text-[10px] cursor-pointer"
                          >
                            ❤️
                          </button>
                          {isMine && (
                            <>
                              <button
                                onClick={() => {
                                  setEditingMsg(m);
                                  setMessageText(displayText);
                                }}
                                title="Edit"
                                className="p-1 rounded bg-black/20 hover:bg-black/35 cursor-pointer"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() =>
                                  updateDoc(doc(db, 'chats', activeChat.id, 'messages', m.id), {
                                    text: '',
                                    isDeleted: true,
                                  })
                                }
                                title="Delete"
                                className="p-1 rounded bg-black/20 hover:bg-red-600 cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
              {(replyTo || editingMsg) && (
                <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-orange-500/10 text-xs">
                  <span className="truncate">
                    {editingMsg
                      ? `${t.common.edit}: ${decryptedMap[editingMsg.id] ?? editingMsg.text}`
                      : `${t.chat.replyingTo}: ${decryptedMap[replyTo!.id] ?? replyTo!.text}`}
                  </span>
                  <button
                    onClick={() => {
                      setReplyTo(null);
                      setEditingMsg(null);
                      setMessageText('');
                    }}
                    className="cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage();
                }}
                className="flex items-center gap-2"
              >
                <label className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer shrink-0">
                  <Paperclip className="w-4 h-4 text-zinc-500" />
                  <input type="file" onChange={handleAttachmentUpload} className="hidden" />
                </label>

                <button
                  type="button"
                  onClick={toggleVoiceRecording}
                  title={t.chat.voiceNote}
                  className={`p-2.5 rounded-xl border cursor-pointer shrink-0 ${
                    recordingVoice
                      ? 'bg-red-600 border-red-600 text-white animate-pulse'
                      : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500'
                  }`}
                >
                  {recordingVoice ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={shareCurrentLocation}
                  title={t.chat.shareLocation}
                  className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 cursor-pointer shrink-0"
                >
                  <MapPin className="w-4 h-4" />
                </button>

                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => {
                    setMessageText(e.target.value);
                    sendWs({
                      type: 'chat:typing',
                      chatId: activeChat.id,
                      participantUids: activeChat.participantUids,
                      isTyping: e.target.value.length > 0,
                    });
                  }}
                  placeholder={uploading ? t.common.loading : t.chat.typeMessage}
                  className="flex-1 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3.5 py-2.5 text-sm focus:outline-none focus:border-orange-500"
                />

                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </>
        )}
      </section>

      {/* New Chat / Group Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">
                {showNewModal === 'direct' ? t.chat.newDirect : t.chat.newGroup}
              </h3>
              <button onClick={() => setShowNewModal(null)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={createNewChat} className="space-y-4">
              {showNewModal === 'group' && (
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  required
                  placeholder={lang === 'ar' ? 'اسم المجموعة...' : 'Group name...'}
                  className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3.5 py-2.5 text-sm focus:outline-none focus:border-orange-500"
                />
              )}

              <div className="max-h-60 overflow-y-auto space-y-1.5">
                {otherUsers.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-4 text-center">
                    {lang === 'ar'
                      ? 'لا يوجد مستخدمون آخرون مسجلون بعد.'
                      : 'No other registered users yet.'}
                  </p>
                ) : (
                  otherUsers.map((u) => {
                    const selected = selectedMembers.includes(u.uid);
                    return (
                      <button
                        type="button"
                        key={u.uid}
                        onClick={() => {
                          if (showNewModal === 'direct') {
                            setSelectedMembers([u.uid]);
                          } else {
                            setSelectedMembers((prev) =>
                              prev.includes(u.uid)
                                ? prev.filter((id) => id !== u.uid)
                                : [...prev, u.uid]
                            );
                          }
                        }}
                        className={`w-full p-2.5 rounded-xl flex items-center justify-between border cursor-pointer ${
                          selected
                            ? 'border-orange-500 bg-orange-500/10'
                            : 'border-zinc-200 dark:border-zinc-800'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <TigerAvatar src={u.avatarUrl} name={u.displayName} size="xs" online={onlineUids.has(u.uid)} />
                          <div className="text-start">
                            <div className="text-xs font-bold">{u.displayName}</div>
                            <div className="text-[11px] text-zinc-500">@{u.username}</div>
                          </div>
                        </div>
                        {selected && <span className="text-xs font-bold text-orange-500">✓</span>}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(null)}
                  className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs cursor-pointer"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={selectedMembers.length === 0}
                  className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                >
                  {t.common.create}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Forward Message Modal */}
      {forwardingMsg && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">{lang === 'ar' ? 'إعادة توجيه إلى' : 'Forward to'}</h3>
              <button onClick={() => setForwardingMsg(null)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {chats.map((c) => (
                <button
                  key={c.id}
                  onClick={async () => {
                    await sendMessage({
                      targetChat: c,
                      overrideText: decryptedMap[forwardingMsg.id] ?? forwardingMsg.text,
                      mediaUrl: forwardingMsg.mediaUrl,
                      mediaType: forwardingMsg.mediaType,
                      fileName: forwardingMsg.fileName,
                      isForwarded: true,
                    });
                    setForwardingMsg(null);
                    pushToast(lang === 'ar' ? 'تمت إعادة توجيه الرسالة' : 'Message forwarded', 'success');
                  }}
                  className="w-full p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-orange-500 text-start text-xs font-semibold cursor-pointer"
                >
                  {getChatDisplayName(c)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* WebRTC Voice/Video Call Overlay */}
      {callState && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl p-6 space-y-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-orange-400 font-semibold">
                  WebRTC {callState.mode === 'video' ? t.chat.videoCall : t.chat.voiceCall}
                </div>
                <div className="text-lg font-bold">{callState.peerName}</div>
              </div>
              <button
                onClick={endCall}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <PhoneOff className="w-4 h-4" /> {lang === 'ar' ? 'إنهاء' : 'End'}
              </button>
            </div>

            {callState.incoming && !callState.active ? (
              <div className="py-10 text-center space-y-4">
                <p className="text-sm text-zinc-300">
                  {lang === 'ar'
                    ? `مكالمة واردة من ${callState.peerName}`
                    : `Incoming call from ${callState.peerName}`}
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={acceptIncomingCall}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm cursor-pointer"
                  >
                    {lang === 'ar' ? 'قبول المكالمة' : 'Accept Call'}
                  </button>
                  <button
                    onClick={endCall}
                    className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm cursor-pointer"
                  >
                    {lang === 'ar' ? 'رفض' : 'Decline'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-60 rounded-xl bg-zinc-900 object-cover border border-zinc-800"
                />
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-60 rounded-xl bg-zinc-900 object-cover border border-zinc-800"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
