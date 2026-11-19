import { Timestamp } from 'firebase/firestore';

export type NavSection =
  | 'feed'
  | 'reels'
  | 'live'
  | 'chat'
  | 'cloud'
  | 'ai'
  | 'driveAi'
  | 'friends'
  | 'groups'
  | 'pages'
  | 'profile'
  | 'notifications'
  | 'premium'
  | 'settings'
  | 'admin'
  | 'notFound';

export type ReactionType = 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry';

export interface UserAccount {
  uid: string;
  email: string;
  role: 'user' | 'admin';
  plan: 'free' | 'plus' | 'pro';
  storageQuotaBytes: number;
  storageUsedBytes: number;
  aiRequestsCount?: number;
  language?: 'ar' | 'en';
  theme?: 'dark' | 'light';
  privacyDefault?: 'public' | 'friends' | 'private';
  notifyMessages?: boolean;
  notifySocial?: boolean;
  isSuspended?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface PublicProfile {
  uid: string;
  displayName: string;
  username: string;
  bio?: string;
  avatarUrl?: string;
  coverUrl?: string;
  location?: string;
  website?: string;
  friendsCount?: number;
  followersCount?: number;
  isVerified?: boolean;
  onlineStatus?: 'online' | 'offline' | 'away';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface PollOption {
  label: string;
  votes: number;
  voterUids: string[];
}

export interface PostItem {
  id: string;
  authorUid: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  backgroundStyle?: string;
  mediaUrls?: string[];
  mediaTypes?: string[];
  externalLink?: string;
  pdfName?: string;
  pdfUrl?: string;
  pollQuestion?: string;
  pollOptions?: PollOption[];
  hashtags?: string[];
  location?: string;
  visibility: 'public' | 'friends' | 'private';
  isDraft: boolean;
  isPinned?: boolean;
  commentsDisabled?: boolean;
  groupId?: string;
  pageId?: string;
  likesCount?: number;
  commentsCount?: number;
  sharesCount?: number;
  viewsCount?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CommentItem {
  id: string;
  postId: string;
  authorUid: string;
  authorName: string;
  authorAvatar?: string;
  parentCommentId?: string;
  text: string;
  imageUrl?: string;
  createdAt?: Timestamp;
}

export interface StoryItem {
  id: string;
  authorUid: string;
  authorName: string;
  authorAvatar?: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  caption?: string;
  sticker?: string;
  musicTrack?: string;
  visibility: 'public' | 'friends' | 'private';
  viewersCount?: number;
  expiresAtMs: number;
  createdAt?: Timestamp;
}

export interface ReelItem {
  id: string;
  authorUid: string;
  authorName: string;
  authorAvatar?: string;
  videoUrl: string;
  thumbnailUrl?: string;
  caption: string;
  hashtags?: string[];
  musicTitle?: string;
  likesCount?: number;
  commentsCount?: number;
  viewsCount?: number;
  sharesCount?: number;
  createdAt?: Timestamp;
}

export interface LiveStreamItem {
  id: string;
  hostUid: string;
  hostName: string;
  hostAvatar?: string;
  title: string;
  status: 'live' | 'ended';
  viewersCount?: number;
  recordingUrl?: string;
  createdAt?: Timestamp;
}

export interface GroupItem {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  privacy: 'public' | 'private';
  ownerUid: string;
  membersCount?: number;
  createdAt?: Timestamp;
}

export interface GroupMemberItem {
  uid: string;
  displayName: string;
  avatarUrl?: string;
  role: 'owner' | 'moderator' | 'member';
  status: 'active' | 'pending';
  joinedAt?: Timestamp;
}

export interface PageItem {
  id: string;
  name: string;
  category: string;
  description?: string;
  avatarUrl?: string;
  coverUrl?: string;
  ownerUid: string;
  followersCount?: number;
  createdAt?: Timestamp;
}

export interface ChatItem {
  id: string;
  type: 'direct' | 'group';
  name?: string;
  ownerUid: string;
  participantUids: string[];
  lastMessageText?: string;
  lastMessageSenderUid?: string;
  e2eeEnabled?: boolean;
  pinnedBy?: string[];
  archivedBy?: string[];
  mutedBy?: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ChatMessageItem {
  id: string;
  chatId: string;
  senderUid: string;
  senderName: string;
  participantUids: string[];
  text: string;
  mediaUrl?: string;
  mediaType?: string;
  fileName?: string;
  location?: string;
  replyToId?: string;
  replyToPreview?: string;
  isForwarded?: boolean;
  isEdited?: boolean;
  isDeleted?: boolean;
  reaction?: string;
  createdAt?: Timestamp;
}

export interface NotificationItem {
  id: string;
  recipientUid: string;
  actorUid: string;
  actorName: string;
  type: 'message' | 'friend_request' | 'like' | 'comment' | 'share' | 'mention' | 'follow' | 'group' | 'page' | 'file_share' | 'live';
  targetId?: string;
  message: string;
  isRead: boolean;
  createdAt?: Timestamp;
}

export interface CloudFolderItem {
  id: string;
  ownerUid: string;
  name: string;
  parentId?: string;
  isTrashed: boolean;
  createdAt?: Timestamp;
}

export interface CloudFileItem {
  id: string;
  ownerUid: string;
  folderId?: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  downloadUrl: string;
  isTrashed: boolean;
  shareToken?: string;
  shareAccess: 'private' | 'link_view' | 'link_edit';
  createdAt?: Timestamp;
}

export interface AiConversationItem {
  id: string;
  ownerUid: string;
  title: string;
  mode: 'chat' | 'drive';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface AiMessageItem {
  id: string;
  ownerUid: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  createdAt?: Timestamp;
}

export interface PaymentRecordItem {
  id: string;
  userId: string;
  plan: 'free' | 'plus' | 'pro';
  amountCents: number;
  currency: string;
  status: 'pending_verification' | 'verified' | 'cancelled';
  note?: string;
  createdAt?: Timestamp;
}

export interface ReportItem {
  id: string;
  reporterUid: string;
  targetType: 'post' | 'comment' | 'user' | 'live' | 'file' | 'group' | 'page';
  targetId: string;
  reason: string;
  status: 'open' | 'reviewed' | 'resolved';
  createdAt?: Timestamp;
}

export interface AdminLogItem {
  id: string;
  adminUid: string;
  action: string;
  targetType: string;
  targetId: string;
  details?: string;
  createdAt?: Timestamp;
}

export interface DriveQuizData {
  title: string;
  questions: Array<{
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  }>;
}

export interface DriveFlashcardsData {
  cards: Array<{
    question: string;
    answer: string;
  }>;
}
