import React, { useEffect, useState, useRef } from 'react';
import {
  collection,
  addDoc,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  Radio,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Send,
  Users,
  StopCircle,
  Share2,
  Flag,
  UserPlus,
  Play,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useTiger } from '../context/TigerContext';
import { LiveStreamItem } from '../types/tiger';
import { uploadCloudFile } from '../lib/upload';
import { TigerAvatar } from './StatusViews';
import { TIGER_ASSETS } from '../lib/assets';

interface LiveComment {
  id: string;
  uid: string;
  name: string;
  text: string;
  createdAt: number;
}

export function LiveModule() {
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
    openReportModal,
  } = useTiger();

  const [streams, setStreams] = useState<LiveStreamItem[]>([]);
  const [title, setTitle] = useState('');
  const [activeStream, setActiveStream] = useState<LiveStreamItem | null>(null);
  const [isHosting, setIsHosting] = useState(false);
  const [camEnabled, setCamEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [liveViewerCount, setLiveViewerCount] = useState(1);
  const [liveComments, setLiveComments] = useState<LiveComment[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [floatingEmojis, setFloatingEmojis] = useState<Array<{ id: string; emoji: string }>>([]);
  const [savingRecording, setSavingRecording] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onSnapshot(
      collection(db, 'liveStreams'),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<LiveStreamItem, 'id'>) }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setStreams(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'liveStreams')
    );
    return () => unsub();
  }, [firebaseUser]);

  // Listen to WebSocket live room comments, viewer counts, and reactions
  useEffect(() => {
    const unsub = subscribeWs((msg) => {
      if (!activeStream || msg.roomId !== activeStream.id) return;
      if (msg.type === 'live:viewers' && typeof msg.count === 'number') {
        setLiveViewerCount(msg.count);
      }
      if (msg.type === 'live:comment') {
        setLiveComments((prev) => [
          ...prev.slice(-60),
          {
            id: String(msg.id || Date.now()),
            uid: String(msg.uid || ''),
            name: String(msg.name || 'Viewer'),
            text: String(msg.text || ''),
            createdAt: Number(msg.createdAt || Date.now()),
          },
        ]);
      }
      if (msg.type === 'live:reaction') {
        const id = String(msg.id || Date.now());
        const emoji = String(msg.emoji || '🔥');
        setFloatingEmojis((prev) => [...prev.slice(-10), { id, emoji }]);
        window.setTimeout(() => {
          setFloatingEmojis((prev) => prev.filter((e) => e.id !== id));
        }, 2000);
      }
    });
    return unsub;
  }, [activeStream, subscribeWs]);

  const stopMediaTracks = () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    return () => {
      stopMediaTracks();
    };
  }, []);

  const handleStartLive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !profile || !title.trim()) return;
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      streamRef.current = mediaStream;

      const docRef = await addDoc(collection(db, 'liveStreams'), {
        hostUid: firebaseUser.uid,
        hostName: profile.displayName,
        hostAvatar: profile.avatarUrl || TIGER_ASSETS.logo,
        title: title.trim().slice(0, 180),
        status: 'live',
        viewersCount: 1,
        recordingUrl: '',
        createdAt: serverTimestamp(),
      });

      const created: LiveStreamItem = {
        id: docRef.id,
        hostUid: firebaseUser.uid,
        hostName: profile.displayName,
        hostAvatar: profile.avatarUrl || TIGER_ASSETS.logo,
        title: title.trim().slice(0, 180),
        status: 'live',
        viewersCount: 1,
      };

      setActiveStream(created);
      setIsHosting(true);
      setLiveComments([]);
      sendWs({ type: 'live:join', roomId: docRef.id });

      // Attach camera stream & start MediaRecorder for post-live Cloud save
      window.setTimeout(() => {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = mediaStream;
        }
      }, 100);

      recordedChunksRef.current = [];
      if (typeof MediaRecorder !== 'undefined') {
        const recorder = new MediaRecorder(mediaStream, {
          mimeType: MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : undefined,
        });
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
        };
        recorder.start(1000);
        recorderRef.current = recorder;
      }

      setTitle('');
      pushToast(lang === 'ar' ? 'بدأ البث المباشر الآن' : 'You are now LIVE!', 'success');
    } catch (err) {
      pushToast(
        lang === 'ar'
          ? 'يرجى السماح بالوصول للكاميرا والميكروفون لبدء البث.'
          : `Camera/Mic permission required: ${err instanceof Error ? err.message : ''}`,
        'error'
      );
    }
  };

  const handleEndLive = async () => {
    if (!activeStream || !firebaseUser) return;
    setSavingRecording(true);
    let recordingUrl = '';

    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        await new Promise<void>((resolve) => {
          recorderRef.current!.onstop = () => resolve();
          recorderRef.current!.stop();
        });
      }

      if (recordedChunksRef.current.length > 0) {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const file = new File([blob], `tiger-live-${activeStream.id}.webm`, {
          type: 'video/webm',
        });
        const uploaded = await uploadCloudFile(file);
        recordingUrl = uploaded.downloadUrl;

        await addDoc(collection(db, 'cloudFiles'), {
          ownerUid: firebaseUser.uid,
          folderId: '',
          name: `Live Recording — ${activeStream.title}.webm`.slice(0, 190),
          mimeType: 'video/webm',
          sizeBytes: uploaded.sizeBytes,
          storageKey: uploaded.storageKey,
          downloadUrl: uploaded.downloadUrl,
          isTrashed: false,
          shareToken: '',
          shareAccess: 'private',
          createdAt: serverTimestamp(),
        });
      }

      await updateDoc(doc(db, 'liveStreams', activeStream.id), {
        status: 'ended',
        recordingUrl,
        viewersCount: liveViewerCount,
      });

      sendWs({ type: 'live:leave', roomId: activeStream.id });
      stopMediaTracks();
      setIsHosting(false);
      setActiveStream(null);
      pushToast(
        lang === 'ar'
          ? 'تم إنهاء البث وحفظ التسجيل في TIGER CLOUD'
          : 'Live ended & recording saved to TIGER CLOUD',
        'success'
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to end live stream', 'error');
    } finally {
      setSavingRecording(false);
    }
  };

  const toggleCam = () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setCamEnabled(track.enabled);
    }
  };

  const toggleMic = () => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setMicEnabled(track.enabled);
    }
  };

  const handleJoinRoom = (stream: LiveStreamItem) => {
    setActiveStream(stream);
    setIsHosting(false);
    setLiveComments([]);
    sendWs({ type: 'live:join', roomId: stream.id });
  };

  const handleSendComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStream || !commentInput.trim()) return;
    sendWs({
      type: 'live:comment',
      roomId: activeStream.id,
      text: commentInput.trim(),
    });
    setLiveComments((prev) => [
      ...prev.slice(-60),
      {
        id: `${Date.now()}`,
        uid: firebaseUser?.uid || '',
        name: profile?.displayName || 'You',
        text: commentInput.trim(),
        createdAt: Date.now(),
      },
    ]);
    setCommentInput('');
  };

  const sendReaction = (emoji: string) => {
    if (!activeStream) return;
    sendWs({ type: 'live:reaction', roomId: activeStream.id, emoji });
    const id = `${Date.now()}-${Math.random()}`;
    setFloatingEmojis((prev) => [...prev.slice(-10), { id, emoji }]);
    window.setTimeout(() => {
      setFloatingEmojis((prev) => prev.filter((e) => e.id !== id));
    }, 2000);
  };

  const onlinePeers = Object.values(profilesMap).filter(
    (p) => p.uid !== firebaseUser?.uid && onlineUids.has(p.uid)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold flex items-center gap-2">
            <Radio className="w-6 h-6 text-orange-500" />
            <span>TIGER LIVE</span>
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {lang === 'ar'
              ? 'بث مباشر حقيقي بالكاميرا والميكروفون مع تعليقات فورية وحفظ تلقائي في TIGER CLOUD.'
              : 'Live camera & mic broadcasting with real-time WebSocket chat, guest invites, and automatic Cloud recording.'}
          </p>
        </div>
      </div>

      {/* Active Studio / Viewer Room */}
      {activeStream ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-8 bg-black rounded-2xl overflow-hidden border border-zinc-800 relative flex flex-col">
            <div className="relative flex-1 min-h-[380px]">
              {isHosting ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950 p-6 text-center space-y-3">
                  <TigerAvatar src={activeStream.hostAvatar} name={activeStream.hostName} size="xl" online />
                  <div className="text-white font-bold text-lg">{activeStream.title}</div>
                  <div className="text-xs text-zinc-400">
                    {lang === 'ar'
                      ? `أنت تشاهد غرفة البث المباشر لـ ${activeStream.hostName}`
                      : `Connected to ${activeStream.hostName}'s live broadcast room`}
                  </div>
                </div>
              )}

              {/* Live Overlay Top */}
              <div className="absolute top-4 inset-x-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-xl text-white text-xs font-bold">
                  <span className="px-2 py-0.5 rounded bg-red-600 text-white text-[10px]">LIVE</span>
                  <span className="truncate max-w-[200px]">{activeStream.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-xl text-white text-xs font-mono tabular-nums inline-flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-orange-400" /> {liveViewerCount}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/?live=${activeStream.id}`).catch(() => {});
                      pushToast(t.common.copied, 'success');
                    }}
                    className="p-2 rounded-xl bg-black/70 text-white hover:bg-orange-500 cursor-pointer"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                  {!isHosting && (
                    <button
                      onClick={() =>
                        openReportModal({
                          targetType: 'live',
                          targetId: activeStream.id,
                          label: `Live: ${activeStream.title}`,
                        })
                      }
                      className="p-2 rounded-xl bg-black/70 text-white hover:bg-red-600 cursor-pointer"
                    >
                      <Flag className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Floating Reactions */}
              <div className="absolute bottom-20 end-5 flex flex-col gap-1 pointer-events-none">
                {floatingEmojis.map((item) => (
                  <span key={item.id} className="text-2xl animate-bounce">
                    {item.emoji}
                  </span>
                ))}
              </div>
            </div>

            {/* Bottom Controls */}
            <div className="p-4 bg-zinc-950 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-3">
              {isHosting ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleCam}
                    className={`p-2.5 rounded-xl text-white cursor-pointer ${
                      camEnabled ? 'bg-zinc-800 hover:bg-zinc-700' : 'bg-red-600'
                    }`}
                  >
                    {camEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={toggleMic}
                    className={`p-2.5 rounded-xl text-white cursor-pointer ${
                      micEnabled ? 'bg-zinc-800 hover:bg-zinc-700' : 'bg-red-600'
                    }`}
                  >
                    {micEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={handleEndLive}
                    disabled={savingRecording}
                    className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <StopCircle className="w-4 h-4" />
                    {savingRecording
                      ? lang === 'ar'
                        ? 'جارٍ حفظ البث...'
                        : 'Saving recording...'
                      : lang === 'ar'
                      ? 'إنهاء وحفظ البث'
                      : 'End & Save to Cloud'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    sendWs({ type: 'live:leave', roomId: activeStream.id });
                    setActiveStream(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-zinc-800 text-white text-xs font-semibold cursor-pointer"
                >
                  {lang === 'ar' ? 'مغادرة البث' : 'Leave Room'}
                </button>
              )}

              <div className="flex items-center gap-1.5">
                {['🔥', '❤️', '👏', '🐅'].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => sendReaction(emoji)}
                    className="w-9 h-9 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-lg cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Real-Time Comments & Guest Invite Panel */}
          <div className="lg:col-span-4 bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col h-[500px]">
            <div className="font-bold text-sm pb-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <span>{lang === 'ar' ? 'التعليقات المباشرة' : 'Live Chat'}</span>
              <span className="text-xs text-zinc-500 tabular-nums">{liveComments.length}</span>
            </div>

            {isHosting && onlinePeers.length > 0 && (
              <div className="py-2.5 border-b border-zinc-200 dark:border-zinc-800">
                <div className="text-[11px] font-semibold text-zinc-500 mb-1.5">
                  {lang === 'ar' ? 'دعوة ضيف متصل' : 'Invite Online Guest'}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {onlinePeers.slice(0, 4).map((peer) => (
                    <button
                      key={peer.uid}
                      onClick={() => {
                        sendWs({
                          type: 'notification:push',
                          recipientUid: peer.uid,
                          notifType: 'live',
                          message: `${profile?.displayName} invited you as a guest on TIGER LIVE: ${activeStream.title}`,
                        });
                        pushToast(`${lang === 'ar' ? 'تمت دعوة' : 'Invited'} ${peer.displayName}`, 'success');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-orange-500/10 text-orange-500 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <UserPlus className="w-3 h-3" /> {peer.displayName}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto py-3 space-y-2.5">
              {liveComments.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-8">
                  {lang === 'ar' ? 'ابدأ التفاعل بالتعليقات المباشرة...' : 'Live comments will appear here...'}
                </p>
              ) : (
                liveComments.map((c) => (
                  <div key={c.id} className="text-xs space-y-0.5">
                    <span className="font-bold text-orange-500 me-1.5">{c.name}</span>
                    <span className="text-zinc-700 dark:text-zinc-300">{c.text}</span>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSendComment} className="flex items-center gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <input
                type="text"
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                placeholder={lang === 'ar' ? 'اكتب تعليقاً مباشراً...' : 'Say something live...'}
                className="flex-1 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs focus:outline-none focus:border-orange-500"
              />
              <button
                type="submit"
                className="p-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      ) : (
        <>
          {/* Go Live Studio Card */}
          <form
            onSubmit={handleStartLive}
            className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
          >
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder={
                lang === 'ar'
                  ? 'عنوان البث المباشر (مثال: جلسة نقاش تقنية مباشرة على TIGER)...'
                  : 'Broadcast title (e.g., Live Q&A on TIGER)...'
              }
              className="flex-1 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500"
            />
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <Radio className="w-4 h-4" />
              {lang === 'ar' ? 'ابدأ البث المباشر الآن' : 'Go Live Now'}
            </button>
          </form>

          {/* Active & Recorded Streams Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {streams.map((st) => (
              <div
                key={st.id}
                className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <TigerAvatar src={st.hostAvatar} name={st.hostName} size="md" online={st.status === 'live'} />
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">{st.title}</div>
                    <div className="text-xs text-zinc-500">
                      {st.hostName} · {st.status === 'live' ? 'LIVE NOW' : lang === 'ar' ? 'منتهي' : 'Ended'} ·{' '}
                      <span className="tabular-nums">{st.viewersCount || 0}</span>
                    </div>
                  </div>
                </div>
                {st.status === 'live' ? (
                  <button
                    onClick={() => handleJoinRoom(st)}
                    className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Play className="w-3.5 h-3.5" />
                    {lang === 'ar' ? 'مشاهدة' : 'Watch'}
                  </button>
                ) : (
                  <span className="text-xs text-zinc-500 shrink-0">
                    {st.recordingUrl
                      ? lang === 'ar'
                        ? 'محفوظ في Cloud'
                        : 'Saved in Cloud'
                      : lang === 'ar'
                      ? 'انتهى'
                      : 'Ended'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
