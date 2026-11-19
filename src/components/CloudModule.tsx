import React, { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import {
  FolderPlus,
  Upload,
  Folder,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  Trash2,
  RotateCcw,
  Share2,
  Copy,
  Edit3,
  Eye,
  Sparkles,
  Download,
  Search,
  ChevronRight,
  FolderInput,
  X,
  HardDrive,
} from 'lucide-react';
import { db, getAuthHeader, handleFirestoreError, OperationType } from '../lib/firebase';
import { useTiger } from '../context/TigerContext';
import { CloudFileItem, CloudFolderItem } from '../types/tiger';
import { uploadCloudFile, formatBytes, formatTimeAgo } from '../lib/upload';

export function CloudModule() {
  const {
    firebaseUser,
    account,
    lang,
    t,
    pushToast,
    openDriveAiWithFiles,
  } = useTiger();

  const [folders, setFolders] = useState<CloudFolderItem[]>([]);
  const [files, setFiles] = useState<CloudFileItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'drive' | 'trash'>('drive');
  const [searchQuery, setSearchQuery] = useState('');
  const [uploading, setUploading] = useState(false);

  // Modals
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFile, setRenamingFile] = useState<CloudFileItem | null>(null);
  const [renameText, setRenameText] = useState('');
  const [movingFile, setMovingFile] = useState<CloudFileItem | null>(null);
  const [sharingFile, setSharingFile] = useState<CloudFileItem | null>(null);
  const [previewFile, setPreviewFile] = useState<{ item: CloudFileItem; blobUrl: string; textContent?: string } | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    const fq = query(collection(db, 'cloudFolders'), where('ownerUid', '==', firebaseUser.uid));
    const unsubF = onSnapshot(
      fq,
      (snap) => {
        setFolders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CloudFolderItem, 'id'>) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'cloudFolders')
    );

    const fiq = query(collection(db, 'cloudFiles'), where('ownerUid', '==', firebaseUser.uid));
    const unsubFi = onSnapshot(
      fiq,
      (snap) => {
        setFiles(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<CloudFileItem, 'id'>) }))
            .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'cloudFiles')
    );

    return () => {
      unsubF();
      unsubFi();
    };
  }, [firebaseUser]);

  const totalUsedBytes = files.reduce((acc, f) => acc + (f.sizeBytes || 0), 0);
  const quotaBytes = account?.storageQuotaBytes || 512 * 1024 * 1024;
  const usedPct = Math.min(100, Math.round((totalUsedBytes / quotaBytes) * 100));

  const handleUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0 || !firebaseUser) return;
    setUploading(true);
    try {
      let addedBytes = 0;
      for (const file of selected) {
        if (totalUsedBytes + addedBytes + file.size > quotaBytes) {
          pushToast(
            lang === 'ar' ? 'تجاوزت مساحة التخزين المتاحة في خطتك.' : 'Storage quota exceeded.',
            'error'
          );
          break;
        }
        const up = await uploadCloudFile(file);
        await addDoc(collection(db, 'cloudFiles'), {
          ownerUid: firebaseUser.uid,
          folderId: currentFolderId || '',
          name: up.originalName.slice(0, 190),
          mimeType: up.mimeType,
          sizeBytes: up.sizeBytes,
          storageKey: up.storageKey,
          downloadUrl: up.downloadUrl,
          isTrashed: false,
          shareToken: '',
          shareAccess: 'private',
          createdAt: serverTimestamp(),
        });
        addedBytes += up.sizeBytes;
      }
      if (addedBytes > 0) {
        await updateDoc(doc(db, 'users', firebaseUser.uid), {
          storageUsedBytes: increment(addedBytes),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
        pushToast(
          lang === 'ar' ? 'تم رفع الملفات إلى TIGER CLOUD' : 'Files uploaded to TIGER CLOUD',
          'success'
        );
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Cloud upload failed', 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !newFolderName.trim()) return;
    await addDoc(collection(db, 'cloudFolders'), {
      ownerUid: firebaseUser.uid,
      name: newFolderName.trim().slice(0, 110),
      parentId: currentFolderId || '',
      isTrashed: false,
      createdAt: serverTimestamp(),
    });
    setNewFolderName('');
    setShowNewFolder(false);
    pushToast(lang === 'ar' ? 'تم إنشاء المجلد' : 'Folder created', 'success');
  };

  const handlePreview = async (item: CloudFileItem) => {
    try {
      const headers = await getAuthHeader();
      const res = await fetch(item.downloadUrl, { headers });
      if (!res.ok) throw new Error('Unable to load file preview');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      let textContent: string | undefined;
      if (item.mimeType.startsWith('text/') || /\.(md|txt|json|csv|js|ts|sql)$/i.test(item.name)) {
        textContent = await blob.text();
      }
      setPreviewFile({ item, blobUrl, textContent });
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Preview failed', 'error');
    }
  };

  const handleDownload = async (item: CloudFileItem) => {
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${item.downloadUrl}?download=1`, { headers });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Download failed', 'error');
    }
  };

  const handleCopyFile = async (item: CloudFileItem) => {
    if (!firebaseUser) return;
    try {
      const headers = await getAuthHeader();
      const res = await fetch('/api/cloud/copy', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ storageKey: item.storageKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Copy failed');
      await addDoc(collection(db, 'cloudFiles'), {
        ownerUid: firebaseUser.uid,
        folderId: item.folderId || '',
        name: `Copy of ${item.name}`.slice(0, 190),
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        storageKey: data.storageKey,
        downloadUrl: data.downloadUrl,
        isTrashed: false,
        shareToken: '',
        shareAccess: 'private',
        createdAt: serverTimestamp(),
      });
      pushToast(lang === 'ar' ? 'تم نسخ الملف بنجاح' : 'File copied', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Copy failed', 'error');
    }
  };

  const handleUpdateShare = async (item: CloudFileItem, access: 'private' | 'link_view' | 'link_edit') => {
    try {
      const headers = await getAuthHeader();
      const res = await fetch('/api/cloud/share-register', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storageKey: item.storageKey,
          fileName: item.name,
          mimeType: item.mimeType,
          access,
          shareToken: item.shareToken || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Share update failed');
      await updateDoc(doc(db, 'cloudFiles', item.id), {
        shareAccess: access,
        shareToken: data.shareToken || '',
      });
      setSharingFile({ ...item, shareAccess: access, shareToken: data.shareToken || '' });
      pushToast(lang === 'ar' ? 'تم تحديث صلاحيات المشاركة' : 'Share permissions updated', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Share update failed', 'error');
    }
  };

  const handlePermanentDelete = async (item: CloudFileItem) => {
    if (!firebaseUser) return;
    try {
      const headers = await getAuthHeader();
      await fetch('/api/cloud/file', {
        method: 'DELETE',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ storageKey: item.storageKey }),
      });
      await deleteDoc(doc(db, 'cloudFiles', item.id));
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        storageUsedBytes: Math.max(0, totalUsedBytes - item.sizeBytes),
        updatedAt: serverTimestamp(),
      }).catch(() => {});
      pushToast(lang === 'ar' ? 'تم حذف الملف نهائياً من الخادم' : 'File permanently deleted', 'info');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  // Breadcrumb path
  const breadcrumbs: CloudFolderItem[] = [];
  let cursor = currentFolderId;
  while (cursor) {
    const found = folders.find((f) => f.id === cursor);
    if (!found) break;
    breadcrumbs.unshift(found);
    cursor = found.parentId || '';
  }

  const visibleFolders = folders.filter((f) => {
    if (viewMode === 'trash') return f.isTrashed;
    if (f.isTrashed) return false;
    if (searchQuery.trim()) return f.name.toLowerCase().includes(searchQuery.toLowerCase());
    return (f.parentId || '') === currentFolderId;
  });

  const visibleFiles = files.filter((f) => {
    if (viewMode === 'trash') return f.isTrashed;
    if (f.isTrashed) return false;
    if (searchQuery.trim()) {
      return `${f.name} ${f.mimeType}`.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return (f.folderId || '') === currentFolderId;
  });

  const getFileIcon = (mime: string, name: string) => {
    if (mime.startsWith('image/')) return <ImageIcon className="w-5 h-5 text-orange-500" />;
    if (mime.startsWith('video/')) return <Film className="w-5 h-5 text-orange-500" />;
    if (mime.startsWith('audio/')) return <Music className="w-5 h-5 text-orange-500" />;
    if (mime === 'application/pdf' || name.endsWith('.pdf')) return <FileText className="w-5 h-5 text-red-500" />;
    return <FileText className="w-5 h-5 text-blue-500" />;
  };

  return (
    <div className="space-y-5">
      {/* Header & Quota Meter */}
      <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-extrabold flex items-center gap-2">
              <HardDrive className="w-6 h-6 text-orange-500" />
              <span>{t.cloud.title}</span>
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {lang === 'ar'
                ? 'تخزين سحابي فعلي على الخادم لملفات PDF وWord والصور والفيديوهات مع ربط مباشر بـ TIGER DRIVE AI.'
                : 'Real server-side cloud storage for PDFs, Word docs, photos, and videos with direct TIGER DRIVE AI analysis.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowNewFolder(true)}
              className="px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FolderPlus className="w-4 h-4 text-orange-500" />
              {t.cloud.newFolder}
            </button>
            <label className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>{uploading ? t.common.loading : t.cloud.uploadFiles}</span>
              <input type="file" multiple onChange={handleUploadFiles} className="hidden" />
            </label>
          </div>
        </div>

        {/* Storage Quota Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-600 dark:text-zinc-400">
              {t.cloud.storageUsed}
            </span>
            <span className="font-mono tabular-nums font-semibold">
              {formatBytes(totalUsedBytes)} / {formatBytes(quotaBytes)} ({usedPct}%)
            </span>
          </div>
          <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                usedPct > 85 ? 'bg-red-500' : 'bg-orange-500'
              }`}
              style={{ width: `${Math.max(2, usedPct)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Controls: Drive/Trash Tabs + Search + Breadcrumbs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-xl">
            <button
              onClick={() => setViewMode('drive')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                viewMode === 'drive' ? 'bg-orange-500 text-white' : 'text-zinc-500'
              }`}
            >
              {t.cloud.myFiles}
            </button>
            <button
              onClick={() => setViewMode('trash')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                viewMode === 'trash' ? 'bg-orange-500 text-white' : 'text-zinc-500'
              }`}
            >
              {t.cloud.trash}
            </button>
          </div>

          {viewMode === 'drive' && visibleFiles.length > 0 && (
            <button
              onClick={() => openDriveAiWithFiles(visibleFiles.map((f) => f.id))}
              className="px-3 py-1.5 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {lang === 'ar' ? 'تلخيص هذا المجلد بـ DRIVE AI' : 'Summarize Folder with DRIVE AI'}
            </button>
          )}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-zinc-400 absolute top-1/2 -translate-y-1/2 start-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={lang === 'ar' ? 'ابحث عن ملف...' : 'Search cloud files...'}
            className="w-full rounded-xl bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 ps-9 pe-3 py-2 text-xs focus:outline-none focus:border-orange-500"
          />
        </div>
      </div>

      {/* Breadcrumbs */}
      {viewMode === 'drive' && (
        <div className="flex items-center gap-1.5 text-xs text-zinc-500 flex-wrap">
          <button
            onClick={() => setCurrentFolderId('')}
            className="font-semibold hover:text-orange-500 cursor-pointer"
          >
            {t.cloud.myFiles}
          </button>
          {breadcrumbs.map((b) => (
            <React.Fragment key={b.id}>
              <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
              <button
                onClick={() => setCurrentFolderId(b.id)}
                className="font-semibold hover:text-orange-500 cursor-pointer"
              >
                {b.name}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Folders Grid */}
      {visibleFolders.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {visibleFolders.map((folder) => (
            <div
              key={folder.id}
              className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 hover:border-orange-500/60 rounded-xl p-3.5 flex items-center justify-between gap-2 transition-colors"
            >
              <button
                onClick={() => {
                  if (viewMode === 'drive') setCurrentFolderId(folder.id);
                }}
                className="flex items-center gap-2.5 min-w-0 flex-1 text-start cursor-pointer"
              >
                <Folder className="w-5 h-5 text-orange-500 shrink-0" />
                <span className="text-xs font-bold truncate">{folder.name}</span>
              </button>
              {viewMode === 'drive' ? (
                <button
                  onClick={() => updateDoc(doc(db, 'cloudFolders', folder.id), { isTrashed: true })}
                  className="p-1 text-zinc-400 hover:text-red-500 cursor-pointer"
                  title={t.common.delete}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => updateDoc(doc(db, 'cloudFolders', folder.id), { isTrashed: false })}
                    className="p-1 text-emerald-500 cursor-pointer"
                    title={t.cloud.restore}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteDoc(doc(db, 'cloudFolders', folder.id))}
                    className="p-1 text-red-500 cursor-pointer"
                    title={t.cloud.deleteForever}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Files Table */}
      <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        {visibleFiles.length === 0 ? (
          <div className="p-10 text-center text-sm text-zinc-500">{t.cloud.emptyCloud}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500">
                <tr>
                  <th className="py-3 px-4 text-start font-semibold">{lang === 'ar' ? 'اسم الملف' : 'Name'}</th>
                  <th className="py-3 px-4 text-start font-semibold">{lang === 'ar' ? 'النوع' : 'Type'}</th>
                  <th className="py-3 px-4 text-end font-semibold">{lang === 'ar' ? 'الحجم' : 'Size'}</th>
                  <th className="py-3 px-4 text-start font-semibold">{lang === 'ar' ? 'المشاركة' : 'Access'}</th>
                  <th className="py-3 px-4 text-end font-semibold">{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                {visibleFiles.map((file) => (
                  <tr key={file.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5 max-w-[260px]">
                        {getFileIcon(file.mimeType, file.name)}
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{file.name}</div>
                          <div className="text-[10px] text-zinc-500">
                            {formatTimeAgo(file.createdAt?.toMillis?.(), lang)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-zinc-500 truncate max-w-[140px]">
                      {file.mimeType.split('/')[1] || file.mimeType}
                    </td>
                    <td className="py-3 px-4 text-end font-mono tabular-nums">
                      {formatBytes(file.sizeBytes)}
                    </td>
                    <td className="py-3 px-4 text-zinc-500">
                      {file.shareAccess === 'private'
                        ? t.common.private
                        : file.shareAccess === 'link_view'
                        ? lang === 'ar'
                          ? 'رابط عرض'
                          : 'Link View'
                        : lang === 'ar'
                        ? 'رابط تحرير'
                        : 'Link Edit'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1">
                        {viewMode === 'drive' ? (
                          <>
                            <button
                              onClick={() => openDriveAiWithFiles([file.id])}
                              title={t.cloud.askDriveAi}
                              className="px-2 py-1 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Sparkles className="w-3.5 h-3.5" /> AI
                            </button>
                            <button
                              onClick={() => handlePreview(file)}
                              title={t.common.preview}
                              className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDownload(file)}
                              title="Download"
                              className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setSharingFile(file)}
                              title={t.cloud.shareSettings}
                              className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                            >
                              <Share2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleCopyFile(file)}
                              title={t.cloud.copy}
                              className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setMovingFile(file)}
                              title={t.cloud.move}
                              className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                            >
                              <FolderInput className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setRenamingFile(file);
                                setRenameText(file.name);
                              }}
                              title={t.cloud.rename}
                              className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => updateDoc(doc(db, 'cloudFiles', file.id), { isTrashed: true })}
                              title={t.common.delete}
                              className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-red-500 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => updateDoc(doc(db, 'cloudFiles', file.id), { isTrashed: false })}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-500 font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> {t.cloud.restore}
                            </button>
                            <button
                              onClick={() => handlePermanentDelete(file)}
                              className="px-2.5 py-1 rounded-lg bg-red-500/15 text-red-500 font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> {t.cloud.deleteForever}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Folder Modal */}
      {showNewFolder && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateFolder}
            className="w-full max-w-sm bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-4"
          >
            <h3 className="font-bold">{t.cloud.newFolder}</h3>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              required
              placeholder={lang === 'ar' ? 'اسم المجلد...' : 'Folder name...'}
              className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3.5 py-2.5 text-sm focus:outline-none focus:border-orange-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewFolder(false)}
                className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs cursor-pointer"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-orange-500 text-white text-xs font-bold cursor-pointer"
              >
                {t.common.create}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rename Modal */}
      {renamingFile && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
            <h3 className="font-bold">{t.cloud.rename}</h3>
            <input
              type="text"
              value={renameText}
              onChange={(e) => setRenameText(e.target.value)}
              className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3.5 py-2.5 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRenamingFile(null)}
                className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs cursor-pointer"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={async () => {
                  if (!renameText.trim()) return;
                  await updateDoc(doc(db, 'cloudFiles', renamingFile.id), {
                    name: renameText.trim().slice(0, 190),
                  });
                  setRenamingFile(null);
                  pushToast(lang === 'ar' ? 'تمت إعادة التسمية' : 'Renamed', 'success');
                }}
                className="px-4 py-2 rounded-xl bg-orange-500 text-white text-xs font-bold cursor-pointer"
              >
                {t.common.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Modal */}
      {movingFile && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">{t.cloud.move}: {movingFile.name}</h3>
              <button onClick={() => setMovingFile(null)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              <button
                onClick={async () => {
                  await updateDoc(doc(db, 'cloudFiles', movingFile.id), { folderId: '' });
                  setMovingFile(null);
                  pushToast(lang === 'ar' ? 'تم نقل الملف للجذر' : 'Moved to Root', 'success');
                }}
                className="w-full p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-orange-500 text-start text-xs font-semibold cursor-pointer"
              >
                / {t.cloud.myFiles}
              </button>
              {folders
                .filter((f) => !f.isTrashed)
                .map((f) => (
                  <button
                    key={f.id}
                    onClick={async () => {
                      await updateDoc(doc(db, 'cloudFiles', movingFile.id), { folderId: f.id });
                      setMovingFile(null);
                      pushToast(`${lang === 'ar' ? 'تم النقل إلى' : 'Moved to'} ${f.name}`, 'success');
                    }}
                    className="w-full p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-orange-500 text-start text-xs font-semibold flex items-center gap-2 cursor-pointer"
                  >
                    <Folder className="w-4 h-4 text-orange-500" /> {f.name}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Share Settings Modal */}
      {sharingFile && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">{t.cloud.shareSettings}</h3>
              <button onClick={() => setSharingFile(null)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs text-zinc-500 truncate">{sharingFile.name}</div>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['private', t.common.private],
                  ['link_view', lang === 'ar' ? 'رابط عرض' : 'Link View'],
                  ['link_edit', lang === 'ar' ? 'رابط تحرير' : 'Link Edit'],
                ] as const
              ).map(([acc, lbl]) => (
                <button
                  key={acc}
                  onClick={() => handleUpdateShare(sharingFile, acc)}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                    sharingFile.shareAccess === acc
                      ? 'border-orange-500 bg-orange-500/15 text-orange-500'
                      : 'border-zinc-200 dark:border-zinc-800'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>

            {sharingFile.shareAccess !== 'private' && sharingFile.shareToken && (
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
                <span className="text-xs font-mono truncate">
                  {`${window.location.origin}/api/cloud/shared/${sharingFile.shareToken}`}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard
                      .writeText(`${window.location.origin}/api/cloud/shared/${sharingFile.shareToken}`)
                      .catch(() => {});
                    pushToast(t.common.copied, 'success');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-bold shrink-0 cursor-pointer"
                >
                  {t.common.copyLink}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Authenticated File Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl max-h-[88vh] bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3">
              <span className="font-bold text-sm truncate">{previewFile.item.name}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    URL.revokeObjectURL(previewFile.blobUrl);
                    setPreviewFile(null);
                    openDriveAiWithFiles([previewFile.item.id]);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" /> {t.cloud.askDriveAi}
                </button>
                <button
                  onClick={() => {
                    URL.revokeObjectURL(previewFile.blobUrl);
                    setPreviewFile(null);
                  }}
                  className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-zinc-950/5 dark:bg-black/40 flex items-center justify-center">
              {previewFile.item.mimeType.startsWith('image/') ? (
                <img
                  src={previewFile.blobUrl}
                  alt={previewFile.item.name}
                  className="max-h-[70vh] object-contain rounded-xl"
                />
              ) : previewFile.item.mimeType.startsWith('video/') ? (
                <video src={previewFile.blobUrl} controls className="max-h-[70vh] rounded-xl" />
              ) : previewFile.item.mimeType.startsWith('audio/') ? (
                <audio src={previewFile.blobUrl} controls />
              ) : previewFile.item.mimeType === 'application/pdf' || previewFile.item.name.endsWith('.pdf') ? (
                <iframe src={previewFile.blobUrl} title={previewFile.item.name} className="w-full h-[70vh] rounded-xl bg-white" />
              ) : previewFile.textContent !== undefined ? (
                <pre className="w-full h-[65vh] overflow-auto text-xs font-mono p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 whitespace-pre-wrap">
                  {previewFile.textContent}
                </pre>
              ) : (
                <div className="text-center space-y-3 py-12">
                  <FileText className="w-12 h-12 mx-auto text-orange-500" />
                  <p className="text-sm text-zinc-500">
                    {lang === 'ar'
                      ? 'المعاينة المباشرة غير مدعومة لهذا النوع، يمكنك تنزيله أو تحليله عبر TIGER DRIVE AI.'
                      : 'Direct preview unavailable for this format. Download or analyze with TIGER DRIVE AI.'}
                  </p>
                  <button
                    onClick={() => handleDownload(previewFile.item)}
                    className="px-4 py-2 rounded-xl bg-orange-500 text-white text-xs font-bold cursor-pointer"
                  >
                    Download
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
