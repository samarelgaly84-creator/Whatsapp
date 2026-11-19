# TIGER Security Specification (Phase 0 — Payload-First Security TDD)

## 1. Core Data Invariants
1. **PII Isolation**: `/users/{userId}` stores email, quota, role, and plan and is readable/writable ONLY by `userId == request.auth.uid` or `isAdmin()`. Public social discovery uses `/publicProfiles/{userId}` which never stores email or private contact info.
2. **No Privilege Escalation**: Regular users cannot create `/users/{userId}` with `role == 'admin'` or `plan != 'free'`, nor update `role`, `plan`, `storageQuotaBytes`, or `isSuspended`.
3. **Verified Identity**: All writes require `isVerifiedUser()` (`request.auth != null && request.auth.token.email_verified == true`).
4. **Master Gate Membership**: Messages in `/chats/{chatId}/messages/{messageId}` require the caller to be in the parent chat's `participantUids`. Subcollection access revokes immediately if removed.
5. **Cloud Storage Isolation**: `/cloudFiles/{fileId}` and `/cloudFolders/{folderId}` are strictly scoped to `ownerUid == request.auth.uid` (or `shareAccess != 'private'` on single-doc `get` for shared files).
6. **Immutable Audit Trail & Payment Verification**: `/adminLogs/{logId}` is append-only by admins (no updates/deletes). `/payments/{paymentId}` cannot be self-created with `status == 'verified'` by non-admins.
7. **Temporal Integrity**: `createdAt` must equal `request.time` on creation and remain immutable on update.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Self-Admin Promotion**: `POST /users/{uid}` with `{ role: "admin", plan: "pro" }`.
2. **Shadow Field Injection**: `POST /posts/{id}` with valid fields plus `{ isAdminApproved: true }`.
3. **Email Spoofing (Unverified)**: Write with `email: "samarelgaly84@gmail.com"` and `email_verified: false`.
4. **PII Blanket Read**: `GET /users/{otherUid}` as a signed-in non-owner non-admin.
5. **Cross-User Post Impersonation**: `POST /posts/{id}` with `authorUid: "victim_uid"`.
6. **Unauthorized Chat Eavesdropping**: `GET /chats/{chatId}/messages/{msgId}` where caller is not in `participantUids`.
7. **Cloud File Snooping**: `LIST /cloudFiles` without filtering `ownerUid == request.auth.uid`.
8. **Fake Verified Payment**: `POST /payments/{id}` with `{ status: "verified", plan: "pro" }` as non-admin.
9. **ID Poisoning**: `CREATE /posts/{200_char_invalid_id!@#}` failing `isValidId()`.
10. **Immutable Timestamp Tampering**: `UPDATE /posts/{id}` modifying `createdAt` or `authorUid`.
11. **Terminal Report Tampering**: Non-admin updating `/reports/{id}` status to `"resolved"`.
12. **Audit Log Deletion**: Attempting `DELETE /adminLogs/{id}` even by an admin.
