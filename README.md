# Guti Chat — Complete Frontend API & Integration Reference

**Repository:** https://github.com/Yousufshishir/guti-chat  
**Purpose:** One self-contained reference for a frontend developer or AI coding agent to integrate every API route and Socket.IO event documented in this repository's `swagger.json`.

> **Source of truth:** This document is generated from the repository's `swagger.json` supplied for this task. Before implementing an endpoint, cross-check the actual route/controller implementation if runtime behavior differs. Do not invent routes or fields that are not documented.

## Table of contents

- [Project integration rules](#project-integration-rules)
- [Base URL and authentication](#base-url-and-authentication)
- [Endpoint inventory](#endpoint-inventory)
- [Auth](#auth)
- [User](#user)
- [Social](#social)
- [Messaging](#messaging)
- [Groups](#groups)
- [Posts](#posts)
- [Comments](#comments)
- [Moods](#moods)
- [Media](#media)
- [Socket.IO Events](#socket.io-events)
- [Socket.IO real-time contract](#socketio-real-time-contract)
- [Data models and reusable schemas](#data-models-and-reusable-schemas)
- [Frontend implementation checklist](#frontend-implementation-checklist)
- [Important security and integration notes](#important-security-and-integration-notes)

## Project integration rules

- This is a REST + Socket.IO application with client-side end-to-end encryption (E2EE).
- Keep API calls in a centralized client/service layer; do not scatter raw `fetch`/Axios calls across UI components.
- Keep endpoint paths, HTTP methods, payload fields, query parameters, and response assumptions aligned with this document and `swagger.json`.
- For endpoints marked as authenticated, send `Authorization: Bearer <accessToken>`.
- Handle loading, empty, success, validation, unauthorized, forbidden, not-found, and server-error states in the UI.
- Never log passwords, access/refresh tokens, private keys, backup PINs, or plaintext E2EE content.
- Do not replace ciphertext with plaintext or decrypt content on the server. Encrypt/decrypt in the client using the app's existing crypto implementation.
- Preserve existing app behavior and architecture; do not remove or rewrite unrelated features while integrating endpoints.

## Base URL and authentication

- **OpenAPI title:** Zero-Knowledge E2EE Social Engine
- **API documentation version:** 1.0.0
- **Documented development base URL:** `http://localhost:5000`
- Configure the base URL through the frontend environment configuration (for example, `VITE_API_BASE_URL` or the project's existing equivalent). Do not hard-code production URLs into components.
- **JWT auth:** use `Authorization: Bearer <token>` for protected REST endpoints.
- **Login:** `POST /api/auth/login` returns an access token and refresh token according to the schema.
- **Refresh:** `POST /api/auth/refresh-token` accepts `refreshToken` and returns a new access token.
- **Logout:** `POST /api/auth/logout` is authenticated and invalidates the token version; update local session state and disconnect/handle socket logout.
- The OpenAPI description documents access-token expiry as 15 minutes–1 hour and refresh-token expiry as 7–30 days; use actual backend configuration as the final authority.
- Never put secrets in a frontend `.env` variable prefixed for public exposure.

### Suggested frontend API client contract

1. One shared API client with base URL, JSON defaults, and bearer-token injection.
2. Centralized handling for `401` (attempt refresh once if appropriate, otherwise clear session and redirect to login), `403`, validation errors, and network errors.
3. Do not retry non-idempotent writes automatically unless the backend supports safe idempotency.
4. For file/media uploads, follow the documented signed Cloudinary flow and the existing backend response format; do not invent signature fields.

## Endpoint inventory

**Documented HTTP operations:** 76

| Method | Endpoint | Auth | Feature |
|---|---|---|---|
| `POST` | `/api/auth/register` | No auth documented | Register a new user |
| `POST` | `/api/auth/login` | No auth documented | Login with email or username |
| `POST` | `/api/auth/supabase-email-login` | No auth documented | Login / Register via Supabase (Gmail) |
| `POST` | `/api/auth/refresh-token` | No auth documented | Generate new Access Token via Refresh Token |
| `POST` | `/api/auth/forgot-password` | No auth documented | Request Password Reset OTP |
| `POST` | `/api/auth/verify-otp` | No auth documented | Verify Reset OTP |
| `PUT` | `/api/auth/reset-password` | No auth documented | Reset Password with OTP |
| `PUT` | `/api/auth/update-password` | Bearer JWT | Change password while logged in |
| `POST` | `/api/auth/logout` | Bearer JWT | Logout and invalidate token (increments tokenVersion → also kills sockets) |
| `GET` | `/api/auth/me` | Bearer JWT | Get logged-in user profile |
| `PUT` | `/api/users/profile` | Bearer JWT | Update user profile |
| `PUT` | `/api/users/backup-settings` | Bearer JWT | Update Google Drive backup settings |
| `GET` | `/api/users/backup-status` | Bearer JWT | Get backup status |
| `PUT` | `/api/users/update-backup-timestamp` | Bearer JWT | Update last backup timestamp |
| `DELETE` | `/api/users/request-deletion` | Bearer JWT | Request account deletion (24-hour grace period) |
| `POST` | `/api/users/cancel-deletion` | Bearer JWT | Cancel scheduled account deletion |
| `POST` | `/api/users/restore-crypto-vault` | Bearer JWT | Restore encrypted private key using backup PIN |
| `GET` | `/api/users/search` | Bearer JWT | Search users by name or username (respects block + profile lock) |
| `GET` | `/api/users/{id}` | Bearer JWT | Get specific user profile by ID |
| `GET` | `/api/users/keys/{id}` | Bearer JWT | Fetch user's public key (E2EE key exchange) |
| `PUT` | `/api/users/toggle-profile-lock` | Bearer JWT | Toggle profile lock (Facebook-style) |
| `GET` | `/api/users/friends` | Bearer JWT | Get friends list |
| `GET` | `/api/users/friend-requests` | Bearer JWT | Get incoming and outgoing friend requests |
| `POST` | `/api/users/friend-request/send/{id}` | Bearer JWT | Send friend request |
| `POST` | `/api/users/friend-request/accept/{id}` | Bearer JWT | Accept friend request |
| `POST` | `/api/users/friend-request/reject/{id}` | Bearer JWT | Reject friend request |
| `POST` | `/api/users/unfriend/{id}` | Bearer JWT | Unfriend a user |
| `PUT` | `/api/users/block/{id}` | Bearer JWT | Block a user |
| `PUT` | `/api/users/unblock/{id}` | Bearer JWT | Unblock a user |
| `GET` | `/api/users/blocked` | Bearer JWT | Get blocked users list |
| `PUT` | `/api/users/mute/{id}` | Bearer JWT | Mute a specific user (disable notifications) |
| `PUT` | `/api/users/unmute/{id}` | Bearer JWT | Unmute a specific user |
| `PUT` | `/api/users/mute-group/{groupId}` | Bearer JWT | Mute a specific group (must be a member) |
| `PUT` | `/api/users/unmute-group/{groupId}` | Bearer JWT | Unmute a specific group |
| `POST` | `/api/messages/send` | Bearer JWT | Send 1-to-1 or group message (persisted) |
| `POST` | `/api/messages/forward` | Bearer JWT | Forward an existing message |
| `GET` | `/api/messages/chat/{userId}` | Bearer JWT | Get 1-to-1 chat history |
| `DELETE` | `/api/messages/chat/{userId}` | Bearer JWT | Delete entire 1-to-1 chat for everyone |
| `GET` | `/api/messages/group/{groupId}` | Bearer JWT | Get group chat history |
| `PUT` | `/api/messages/seen/{senderId}` | Bearer JWT | Mark messages as read |
| `PUT` | `/api/messages/{id}/react` | Bearer JWT | React to a message |
| `DELETE` | `/api/messages/{id}` | Bearer JWT | Delete message for everyone |
| `DELETE` | `/api/messages/{id}/me` | Bearer JWT | Delete message for me only |
| `GET` | `/api/messages/{id}/info` | Bearer JWT | Get message read receipts |
| `GET` | `/api/messages/unread-count` | Bearer JWT | Get total unread count and per-sender breakdown |
| `POST` | `/api/messages/bulk-delete` | Bearer JWT | Delete multiple messages at once |
| `GET` | `/api/messages/search/{userId}` | Bearer JWT | Search messages in 1-to-1 chat |
| `GET` | `/api/messages/search/group/{groupId}` | Bearer JWT | Search messages in group chat |
| `DELETE` | `/api/messages/chat/{userId}/me` | Bearer JWT | Clear entire 1-to-1 chat for yourself |
| `DELETE` | `/api/messages/group/{groupId}/me` | Bearer JWT | Clear entire group chat for yourself |
| `POST` | `/api/groups/create` | Bearer JWT | Create a new group |
| `GET` | `/api/groups` | Bearer JWT | Get all groups you are a member of |
| `GET` | `/api/groups/{id}` | Bearer JWT | Get group details |
| `PUT` | `/api/groups/{id}` | Bearer JWT | Edit group name or icon |
| `PUT` | `/api/groups/{id}/leave` | Bearer JWT | Leave a group |
| `PUT` | `/api/groups/{id}/add-member` | Bearer JWT | Add a member (Creator only) |
| `DELETE` | `/api/groups/{id}/remove-member/{userId}` | Bearer JWT | Remove a member (Creator only) |
| `PUT` | `/api/groups/{id}/rotate-keys` | Bearer JWT | Rotate E2EE Group Keys |
| `POST` | `/api/posts/create` | Bearer JWT | Create an E2EE post |
| `GET` | `/api/posts/feed` | Bearer JWT | Get timeline feed |
| `GET` | `/api/posts/user/{userId}` | Bearer JWT | Get specific user's posts |
| `GET` | `/api/posts/{id}` | Bearer JWT | Get single post details |
| `PUT` | `/api/posts/{id}` | Bearer JWT | Edit a post |
| `DELETE` | `/api/posts/{id}` | Bearer JWT | Delete a post (cascades Cloudinary media delete) |
| `PUT` | `/api/posts/{id}/react` | Bearer JWT | React to a post |
| `PUT` | `/api/posts/{id}/visibility` | Bearer JWT | Toggle post visibility (public/friends) |
| `POST` | `/api/comments/{postId}` | Bearer JWT | Add a comment or nested reply |
| `GET` | `/api/comments/{postId}` | Bearer JWT | Get nested comments for a post |
| `PUT` | `/api/comments/{commentId}` | Bearer JWT | Edit a comment |
| `DELETE` | `/api/comments/{commentId}` | Bearer JWT | Delete a comment |
| `POST` | `/api/moods/set` | Bearer JWT | Set today's mood |
| `GET` | `/api/moods/dashboard` | Bearer JWT | Get mood dashboard with curated message |
| `GET` | `/api/moods/history` | Bearer JWT | Get mood history |
| `GET` | `/api/media/upload-signature` | Bearer JWT | Get Cloudinary upload signature |
| `GET` | `/api/media/sign-url/{publicId}` | Bearer JWT | Generate signed URL for private media |
| `GET` | `/socket.io` | No auth documented | Socket.IO WebSocket Connection (pseudo-endpoint) |

## Auth

### `POST /api/auth/register`

**Purpose:** Register a new user.

**Authentication:** No authentication requirement documented in OpenAPI.

**Path and query parameters**

No path/query parameters documented.

**Request body**

Content-Type: `application/json`  
Required body: Yes

See [Schema: `RegisterRequest`](#schema-registerrequest).

**Responses**

- **201** — User registered. Response schema: `AuthResponse`.
- **400** — Validation failed or disposable email. Response schema: `ErrorResponse`.
- **409** — Duplicate email or username. Response schema: `ErrorResponse`.

---

### `POST /api/auth/login`

**Purpose:** Login with email or username.

**Authentication:** No authentication requirement documented in OpenAPI.

**Path and query parameters**

No path/query parameters documented.

**Request body**

Content-Type: `application/json`  
Required body: Yes

See [Schema: `LoginRequest`](#schema-loginrequest).

**Responses**

- **200** — Returns Access + Refresh Tokens. Response schema: `AuthResponse`.
- **400** — Missing fields. Response schema: `ErrorResponse`.
- **401** — Invalid credentials or account locked. Response schema: `ErrorResponse`.

---

### `POST /api/auth/supabase-email-login`

**Purpose:** Login / Register via Supabase (Gmail).

**Authentication:** No authentication requirement documented in OpenAPI.

**Path and query parameters**

No path/query parameters documented.

**Request body**

Content-Type: `application/json`  
Required body: Yes

See [Schema: `SupabaseLoginRequest`](#schema-supabaseloginrequest).

**Responses**

- **200** — Existing user logged in. Response schema: `AuthResponse`.
- **201** — New user auto-created. Response schema: `AuthResponse`.
- **401** — Invalid Supabase token. Response schema: `ErrorResponse`.

---

### `POST /api/auth/refresh-token`

**Purpose:** Generate new Access Token via Refresh Token.

**Authentication:** No authentication requirement documented in OpenAPI.

**Path and query parameters**

No path/query parameters documented.

**Request body**

Content-Type: `application/json`  
Required body: Yes

See [Schema: `RefreshTokenRequest`](#schema-refreshtokenrequest).

**Responses**

- **200** — New Access Token returned. Response schema: `RefreshTokenResponse`.
- **403** — Invalid or expired refresh token. Response schema: `ErrorResponse`.

---

### `POST /api/auth/forgot-password`

**Purpose:** Request Password Reset OTP.

**Authentication:** No authentication requirement documented in OpenAPI.

**Path and query parameters**

No path/query parameters documented.

**Request body**

Content-Type: `application/json`  
Required body: Yes

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `email` | string | Yes | Example: `yousuf@test.com` |

**Responses**

- **200** — OTP sent to email.
- **404** — User not found. Response schema: `ErrorResponse`.

---

### `POST /api/auth/verify-otp`

**Purpose:** Verify Reset OTP.

**Authentication:** No authentication requirement documented in OpenAPI.

**Path and query parameters**

No path/query parameters documented.

**Request body**

Content-Type: `application/json`  
Required body: Yes

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `email` | string | Yes |  |
| `otp` | string | Yes | Example: `123456` |

**Responses**

- **200** — OTP verified.
- **400** — Invalid or expired OTP (or blocked after 3 wrong attempts). Response schema: `ErrorResponse`.

---

### `PUT /api/auth/reset-password`

**Purpose:** Reset Password with OTP.

**Authentication:** No authentication requirement documented in OpenAPI.

**Path and query parameters**

No path/query parameters documented.

**Request body**

Content-Type: `application/json`  
Required body: Yes

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `email` | string | Yes |  |
| `otp` | string | Yes | Example: `123456` |
| `newPassword` | string | Yes | Example: `newPassword123` |

**Responses**

- **200** — Password reset successfully.
- **400** — Invalid or expired OTP. Response schema: `ErrorResponse`.

---

### `PUT /api/auth/update-password`

**Purpose:** Change password while logged in.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

No path/query parameters documented.

**Request body**

Content-Type: `application/json`  
Required body: Yes

See [Schema: `UpdatePasswordRequest`](#schema-updatepasswordrequest).

**Responses**

- **200** — Password updated successfully.
- **401** — Current password is incorrect. Response schema: `ErrorResponse`.

---

### `POST /api/auth/logout`

**Purpose:** Logout and invalidate token (increments tokenVersion → also kills sockets).

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

No path/query parameters documented.

**Request body:** None documented.

**Responses**

- **200** — Logged out successfully.

---

### `GET /api/auth/me`

**Purpose:** Get logged-in user profile.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

No path/query parameters documented.

**Request body:** None documented.

**Responses**

- **200** — User profile returned. Response schema: `UserProfile`.
- **401** — Unauthorized / token revoked. Response schema: `ErrorResponse`.

---

## User

### `PUT /api/users/profile`

**Purpose:** Update user profile.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

No path/query parameters documented.

**Request body**

Content-Type: `application/json`  
Required body: Yes

See [Schema: `UpdateProfileRequest`](#schema-updateprofilerequest).

**Responses**

- **200** — Profile updated. Response schema: `UserProfile`.
- **404** — User not found. Response schema: `ErrorResponse`.

---

### `PUT /api/users/backup-settings`

**Purpose:** Update Google Drive backup settings.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

No path/query parameters documented.

**Request body**

Content-Type: `application/json`  
Required body: Yes

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `isBackupEnabled` | boolean | No | Example: `True` |
| `backupFrequency` | string (daily, weekly, manual) | No | Example: `daily` |

**Responses**

- **200** — Backup settings updated.
- **400** — Invalid frequency. Response schema: `ErrorResponse`.

---

### `GET /api/users/backup-status`

**Purpose:** Get backup status.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

No path/query parameters documented.

**Request body:** None documented.

**Responses**

- **200** — Backup status returned.

---

### `PUT /api/users/update-backup-timestamp`

**Purpose:** Update last backup timestamp.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

No path/query parameters documented.

**Request body**

Content-Type: `application/json`  
Required body: Yes

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `googleDriveFolderId` | string | No | Example: `folder_id_123` |

**Responses**

- **200** — Timestamp updated.

---

### `DELETE /api/users/request-deletion`

**Purpose:** Request account deletion (24-hour grace period).

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

No path/query parameters documented.

**Request body:** None documented.

**Responses**

- **200** — Deletion scheduled (24h to cancel).

---

### `POST /api/users/cancel-deletion`

**Purpose:** Cancel scheduled account deletion.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

No path/query parameters documented.

**Request body:** None documented.

**Responses**

- **200** — Deletion cancelled.

---

### `POST /api/users/restore-crypto-vault`

**Purpose:** Restore encrypted private key using backup PIN.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

No path/query parameters documented.

**Request body**

Content-Type: `application/json`  
Required body: Yes

See [Schema: `CryptoVaultRestoreRequest`](#schema-cryptovaultrestorerequest).

**Responses**

- **200** — Private key returned. Response type: `object`.
- **401** — Invalid PIN. Response schema: `ErrorResponse`.
- **404** — No crypto vault found. Response schema: `ErrorResponse`.

---

## Social

### `GET /api/users/search`

**Purpose:** Search users by name or username (respects block + profile lock).

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `query` | query | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — Array of matching users (locked profiles return only summary). Response type: `object`.
- **400** — Missing or invalid query. Response schema: `ErrorResponse`.

---

### `GET /api/users/{id}`

**Purpose:** Get specific user profile by ID.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `id` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — Profile returned (or locked summary if not a friend).
- **400** — Cannot request own profile via this route. Response schema: `ErrorResponse`.
- **403** — Blocked. Response schema: `ErrorResponse`.
- **404** — User not found. Response schema: `ErrorResponse`.

---

### `GET /api/users/keys/{id}`

**Purpose:** Fetch user's public key (E2EE key exchange).

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `id` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — Public key returned. Response type: `object`.
- **403** — Blocked relationship. Response schema: `ErrorResponse`.
- **404** — User or key not found. Response schema: `ErrorResponse`.

---

### `PUT /api/users/toggle-profile-lock`

**Purpose:** Toggle profile lock (Facebook-style).

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

No path/query parameters documented.

**Request body:** None documented.

**Responses**

- **200** — Lock toggled. Response type: `object`.

---

### `GET /api/users/friends`

**Purpose:** Get friends list.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

No path/query parameters documented.

**Request body:** None documented.

**Responses**

- **200** — List of friends. Response type: `object`.

---

### `GET /api/users/friend-requests`

**Purpose:** Get incoming and outgoing friend requests.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

No path/query parameters documented.

**Request body:** None documented.

**Responses**

- **200** — Pending requests. Response type: `object`.

---

### `POST /api/users/friend-request/send/{id}`

**Purpose:** Send friend request.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `id` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — Request sent.
- **400** — Already friends / pending / self. Response schema: `ErrorResponse`.
- **403** — Blocked. Response schema: `ErrorResponse`.
- **404** — Target user not found. Response schema: `ErrorResponse`.

---

### `POST /api/users/friend-request/accept/{id}`

**Purpose:** Accept friend request.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `id` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — Request accepted.
- **400** — No pending request. Response schema: `ErrorResponse`.

---

### `POST /api/users/friend-request/reject/{id}`

**Purpose:** Reject friend request.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `id` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — Request rejected.

---

### `POST /api/users/unfriend/{id}`

**Purpose:** Unfriend a user.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `id` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — Unfriended.

---

### `PUT /api/users/block/{id}`

**Purpose:** Block a user.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `id` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — User blocked.
- **400** — Cannot block yourself. Response schema: `ErrorResponse`.

---

### `PUT /api/users/unblock/{id}`

**Purpose:** Unblock a user.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `id` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — User unblocked.

---

### `GET /api/users/blocked`

**Purpose:** Get blocked users list.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

No path/query parameters documented.

**Request body:** None documented.

**Responses**

- **200** — List of blocked users. Response type: `object`.

---

### `PUT /api/users/mute/{id}`

**Purpose:** Mute a specific user (disable notifications).

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `id` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — User muted successfully.
- **400** — Cannot mute yourself. Response schema: `ErrorResponse`.
- **404** — Target user not found. Response schema: `ErrorResponse`.

---

### `PUT /api/users/unmute/{id}`

**Purpose:** Unmute a specific user.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `id` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — User unmuted successfully.

---

### `PUT /api/users/mute-group/{groupId}`

**Purpose:** Mute a specific group (must be a member).

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `groupId` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — Group muted successfully.
- **403** — Not a member of the group. Response schema: `ErrorResponse`.
- **404** — Group not found. Response schema: `ErrorResponse`.

---

### `PUT /api/users/unmute-group/{groupId}`

**Purpose:** Unmute a specific group.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `groupId` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — Group unmuted successfully.

---

## Messaging

### `POST /api/messages/send`

**Purpose:** Send 1-to-1 or group message (persisted).

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

No path/query parameters documented.

**Request body**

Content-Type: `application/json`  
Required body: Yes

See [Schema: `SendMessageRequest`](#schema-sendmessagerequest).

**Responses**

- **201** — Message sent. Response type: `object`.
- **403** — Blocked. Response schema: `ErrorResponse`.

---

### `POST /api/messages/forward`

**Purpose:** Forward an existing message.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

No path/query parameters documented.

**Request body**

Content-Type: `application/json`  
Required body: Yes

See [Schema: `ForwardMessageRequest`](#schema-forwardmessagerequest).

**Responses**

- **201** — Message forwarded. Response schema: `Message`.

---

### `GET /api/messages/chat/{userId}`

**Purpose:** Get 1-to-1 chat history.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `userId` | path | Yes | string |  |
| `page` | query | No | integer | ; default `1` |
| `limit` | query | No | integer | ; default `50` |

**Request body:** None documented.

**Responses**

- **200** — Chat history. Response type: `object`.

---

### `DELETE /api/messages/chat/{userId}`

**Purpose:** Delete entire 1-to-1 chat for everyone.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `userId` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — Entire chat deleted.

---

### `GET /api/messages/group/{groupId}`

**Purpose:** Get group chat history.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `groupId` | path | Yes | string |  |
| `page` | query | No | integer | ; default `1` |
| `limit` | query | No | integer | ; default `50` |

**Request body:** None documented.

**Responses**

- **200** — Group chat history. Response type: `object`.

---

### `PUT /api/messages/seen/{senderId}`

**Purpose:** Mark messages as read.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `senderId` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — Messages marked as seen.

---

### `PUT /api/messages/{id}/react`

**Purpose:** React to a message.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `id` | path | Yes | string |  |

**Request body**

Content-Type: `application/json`  
Required body: Yes

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `reactionType` | string | Yes | Example: `love` |

**Responses**

- **200** — Reaction updated.

---

### `DELETE /api/messages/{id}`

**Purpose:** Delete message for everyone.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `id` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — Message deleted.

---

### `DELETE /api/messages/{id}/me`

**Purpose:** Delete message for me only.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `id` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — Message hidden from your chat.

---

### `GET /api/messages/{id}/info`

**Purpose:** Get message read receipts.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `id` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — Read receipts returned.

---

### `GET /api/messages/unread-count`

**Purpose:** Get total unread count and per-sender breakdown.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

No path/query parameters documented.

**Request body:** None documented.

**Responses**

- **200** — Unread counts.

---

### `POST /api/messages/bulk-delete`

**Purpose:** Delete multiple messages at once.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

No path/query parameters documented.

**Request body**

Content-Type: `application/json`  
Required body: Yes

See [Schema: `BulkDeleteRequest`](#schema-bulkdeleterequest).

**Responses**

- **200** — Messages deleted.

---

### `GET /api/messages/search/{userId}`

**Purpose:** Search messages in 1-to-1 chat.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `userId` | path | Yes | string |  |
| `query` | query | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — Search results.

---

### `GET /api/messages/search/group/{groupId}`

**Purpose:** Search messages in group chat.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `groupId` | path | Yes | string |  |
| `query` | query | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — Search results.

---

### `DELETE /api/messages/chat/{userId}/me`

**Purpose:** Clear entire 1-to-1 chat for yourself.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `userId` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — Chat cleared for you.

---

### `DELETE /api/messages/group/{groupId}/me`

**Purpose:** Clear entire group chat for yourself.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `groupId` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — Group chat cleared for you.

---

## Groups

### `POST /api/groups/create`

**Purpose:** Create a new group.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

No path/query parameters documented.

**Request body**

Content-Type: `application/json`  
Required body: Yes

See [Schema: `CreateGroupRequest`](#schema-creategrouprequest).

**Responses**

- **201** — Group created. Response schema: `Group`.

---

### `GET /api/groups`

**Purpose:** Get all groups you are a member of.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

No path/query parameters documented.

**Request body:** None documented.

**Responses**

- **200** — List of groups. Response type: `array`.

---

### `GET /api/groups/{id}`

**Purpose:** Get group details.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `id` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — Group details. Response schema: `Group`.

---

### `PUT /api/groups/{id}`

**Purpose:** Edit group name or icon.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `id` | path | Yes | string |  |

**Request body**

Content-Type: `application/json`  
Required body: Yes

See [Schema: `EditGroupRequest`](#schema-editgrouprequest).

**Responses**

- **200** — Group updated.

---

### `PUT /api/groups/{id}/leave`

**Purpose:** Leave a group.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `id` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — Left group.

---

### `PUT /api/groups/{id}/add-member`

**Purpose:** Add a member (Creator only).

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `id` | path | Yes | string |  |

**Request body**

Content-Type: `application/json`  
Required body: Yes

See [Schema: `AddGroupMemberRequest`](#schema-addgroupmemberrequest).

**Responses**

- **200** — Member added.

---

### `DELETE /api/groups/{id}/remove-member/{userId}`

**Purpose:** Remove a member (Creator only).

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `id` | path | Yes | string |  |
| `userId` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — Member removed.

---

### `PUT /api/groups/{id}/rotate-keys`

**Purpose:** Rotate E2EE Group Keys.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `id` | path | Yes | string |  |

**Request body**

Content-Type: `application/json`  
Required body: Yes

See [Schema: `RotateKeysRequest`](#schema-rotatekeysrequest).

**Responses**

- **200** — Keys rotated. Response schema: `Group`.

---

## Posts

### `POST /api/posts/create`

**Purpose:** Create an E2EE post.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

No path/query parameters documented.

**Request body**

Content-Type: `application/json`  
Required body: Yes

See [Schema: `CreatePostRequest`](#schema-createpostrequest).

**Responses**

- **201** — Post created. Response schema: `Post`.

---

### `GET /api/posts/feed`

**Purpose:** Get timeline feed.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `page` | query | No | integer | ; default `1` |
| `limit` | query | No | integer | ; default `20` |

**Request body:** None documented.

**Responses**

- **200** — Paginated feed. Response type: `array`.

---

### `GET /api/posts/user/{userId}`

**Purpose:** Get specific user's posts.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `userId` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — User posts. Response type: `array`.

---

### `GET /api/posts/{id}`

**Purpose:** Get single post details.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `id` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — Post details. Response schema: `Post`.

---

### `PUT /api/posts/{id}`

**Purpose:** Edit a post.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `id` | path | Yes | string |  |

**Request body**

Content-Type: `application/json`  
Required body: Yes

See [Schema: `CreatePostRequest`](#schema-createpostrequest).

**Responses**

- **200** — Post updated.

---

### `DELETE /api/posts/{id}`

**Purpose:** Delete a post (cascades Cloudinary media delete).

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `id` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — Post deleted.

---

### `PUT /api/posts/{id}/react`

**Purpose:** React to a post.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `id` | path | Yes | string |  |

**Request body**

Content-Type: `application/json`  
Required body: Yes

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `reactionType` | string | Yes | Example: `love` |

**Responses**

- **200** — Reaction updated.

---

### `PUT /api/posts/{id}/visibility`

**Purpose:** Toggle post visibility (public/friends).

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `id` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — Visibility toggled.

---

## Comments

### `POST /api/comments/{postId}`

**Purpose:** Add a comment or nested reply.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `postId` | path | Yes | string |  |

**Request body**

Content-Type: `application/json`  
Required body: Yes

See [Schema: `CreateCommentRequest`](#schema-createcommentrequest).

**Responses**

- **201** — Comment created. Response schema: `Comment`.

---

### `GET /api/comments/{postId}`

**Purpose:** Get nested comments for a post.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `postId` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — Nested comments. Response type: `array`.

---

### `PUT /api/comments/{commentId}`

**Purpose:** Edit a comment.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `commentId` | path | Yes | string |  |

**Request body**

Content-Type: `application/json`  
Required body: Yes

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `textContent` | string | Yes | Example: `Updated comment` |

**Responses**

- **200** — Comment updated.

---

### `DELETE /api/comments/{commentId}`

**Purpose:** Delete a comment.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `commentId` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — Comment deleted.

---

## Moods

### `POST /api/moods/set`

**Purpose:** Set today's mood.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

No path/query parameters documented.

**Request body**

Content-Type: `application/json`  
Required body: Yes

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `currentMood` | string (Happy, Sad, Angry, Missing You) | Yes | Example: `Happy` |

**Responses**

- **200** — Mood set. Response schema: `MoodLog`.

---

### `GET /api/moods/dashboard`

**Purpose:** Get mood dashboard with curated message.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

No path/query parameters documented.

**Request body:** None documented.

**Responses**

- **200** — Mood dashboard.

---

### `GET /api/moods/history`

**Purpose:** Get mood history.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `page` | query | No | integer | ; default `1` |
| `limit` | query | No | integer | ; default `30` |

**Request body:** None documented.

**Responses**

- **200** — Mood history. Response type: `array`.

---

## Media

### `GET /api/media/upload-signature`

**Purpose:** Get Cloudinary upload signature.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

No path/query parameters documented.

**Request body:** None documented.

**Responses**

- **200** — Signature returned.

---

### `GET /api/media/sign-url/{publicId}`

**Purpose:** Generate signed URL for private media.

**Authentication:** Required — Bearer JWT.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `publicId` | path | Yes | string |  |

**Request body:** None documented.

**Responses**

- **200** — Signed URL returned.

---

## Socket.IO Events

### `GET /socket.io`

**Purpose:** Socket.IO WebSocket Connection (pseudo-endpoint).

**Authentication:** No authentication requirement documented in OpenAPI.

**Notes:** ⚠️ **This is NOT an HTTP endpoint.** It exists so AI/codegen tools can discover the socket contract.  Connect using a Socket.IO client, not `fetch()`.  **Required:** valid JWT in `auth.token` or `?token=<jwt>` query parameter.  See the **Socket.IO Events** tag description for the complete client↔server event reference table.

**Path and query parameters**

| Name | In | Required | Type | Description |
|---|---|---:|---|---|
| `token` | query | No | string | JWT (alternative to auth.token) |

**Request body:** None documented.

**Responses**

- **101** — WebSocket upgrade successful.
- **401** — Auth failed — invalid token, expired session (tokenVersion mismatch), or IP limit exceeded.

> This is a Socket.IO connection contract, not a normal REST endpoint. Use `socket.io-client`, not `fetch()`.

---

## Socket.IO real-time contract

**Connection URL:** same backend origin as the API, normally `http://localhost:5000` in development.

```js
import { io } from 'socket.io-client';

const socket = io(API_BASE_URL, {
  auth: { token: accessToken },
  transports: ['websocket'],
});

socket.on('connect', () => console.log('Socket connected'));
socket.on('connect_error', (error) => console.error('Socket connection failed'));
```

### Client → server events

| Event | Payload | Purpose / constraints |
|---|---|---|
| `join-group` | `groupId: string` | Join a group room; user must be a member. |
| `typing` | `{ receiverId: string }` | One-to-one typing indicator. |
| `stop-typing` | `{ receiverId: string }` | Stop one-to-one typing indicator. |
| `group-typing` | `{ groupId: string }` | Group typing indicator. |
| `group-stop-typing` | `{ groupId: string }` | Stop group typing indicator. |
| `instant-message` | `{ receiverId?: string, groupId?: string, messagePayload: object }` | Real-time message; use receiverId for one-to-one or groupId for group. Offline queue is documented as max 50 messages per user. |

### `instant-message` messagePayload fields

| Field | Type | Notes |
|---|---|---|
| `content` | string | E2EE ciphertext for text or a media URL according to message type. |
| `messageType` | `text \| image \| video` | Message kind. |
| `isDisappearing` | boolean | Whether disappearing-message behavior is enabled. |
| `timerInSeconds` | number | Disappearing timer duration. |
| `mediaPublicId` | string | Optional media identifier. |

### Server → client events

| Event | Payload | Frontend behavior |
|---|---|---|
| `connect` | none | Mark socket connected. |
| `connect_error` | Error | Show/handle connection failure without leaking secrets. |
| `force-logout` | `{ message: string }` | Clear authenticated state and redirect to login. |
| `sync-offline-events` | `Array<{ event: string, payload: object }>` | Replay missed events using a guarded event dispatcher; deduplicate against REST history. |
| `online-status` | `{ userId: string, isOnline: boolean, lastSeen?: ISO8601 }` | Update presence for friends. |
| `typing` | `{ senderId: string, isTyping: boolean }` | Update one-to-one typing UI. |
| `group-typing` | `{ senderId: string, groupId: string, isTyping: boolean }` | Update group typing UI. |
| `receive-message` | message payload | Handle one-to-one incoming message, decrypt client-side, and update chat state. |
| `receive-group-message` | message payload | Handle group incoming message, decrypt client-side, and update chat state. |

### Socket implementation rules

- Register event listeners once per authenticated socket lifecycle and remove listeners during cleanup.
- Do not create a new socket on every React render.
- Reconnect after token refresh using the current token if required by the existing backend.
- The OpenAPI description documents JWT validation, `tokenVersion` checking, max 5 connections per IP, and max 50 queued offline messages per user.
- A user is automatically placed in a private room named by their user ID; group rooms require explicit `join-group`.
- Use REST endpoints for durable history and Socket.IO for live updates. Deduplicate events so a socket message and a REST response do not render twice.

### Full source event description

## Real-time Socket.IO Events

**Note:** Socket.IO does not use HTTP paths. This tag documents every event in a machine-readable form.

### 🔌 Connection
```js
const socket = io('http://localhost:5000', {
  auth: { token: '<JWT_ACCESS_TOKEN>' },  // or ?token=<JWT>
  transports: ['websocket'],
});
```

### 🔐 Auth & Rate Limits
- JWT verified in `io.use` middleware
- `tokenVersion` must match user record (logout revokes sockets)
- **Max 5 connections per IP**
- **Max 50 queued offline messages per user**

### 📤 Client → Server Events

| Event | Payload | Notes |
|-------|---------|-------|
| `join-group` | `groupId: string` | Must be a member of the group |
| `typing` | `{ receiverId: string }` | Ignored if receiver blocked sender |
| `stop-typing` | `{ receiverId: string }` | |
| `group-typing` | `{ groupId: string }` | Broadcast to group room |
| `group-stop-typing` | `{ groupId: string }` | Broadcast to group room |
| `instant-message` | `{ receiverId?: string, groupId?: string, messagePayload: object }` | If receiver offline → queued (max 50) |

### 📥 Server → Client Events

| Event | Payload | Notes |
|-------|---------|-------|
| `connect` | — | Successful connection |
| `connect_error` | `Error` | Auth failed (message: "Authentication error") |
| `force-logout` | `{ message: string }` | Logged in from another device |
| `sync-offline-events` | `Array<{ event: string, payload: object }>` | Emitted immediately on connect if queue non-empty |
| `online-status` | `{ userId: string, isOnline: boolean, lastSeen?: ISO8601 }` | Broadcast to friends |
| `typing` | `{ senderId: string, isTyping: boolean }` | |
| `group-typing` | `{ senderId: string, groupId: string, isTyping: boolean }` | |
| `receive-message` | `messagePayload` | 1-to-1 message |
| `receive-group-message` | `messagePayload` | Group message |

### 🚪 Rooms
- Every user auto-joins a private room named **their userId**
- Users join group rooms explicitly via `join-group` after membership check

### 💡 Typical Client Flow
```js
socket.on('receive-message', (msg) => { /* decrypt + render */ });
socket.on('sync-offline-events', (events) => {
  // Replay missed messages on reconnect
  events.forEach(({ event, payload }) => handle(event, payload));
});
socket.emit('instant-message', {
  receiverId: '...',
  messagePayload: { content: '<cipher>', messageType: 'text' },
});
```

## Data models and reusable schemas

### Schema: `ErrorResponse`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `status` | string | Yes | Example: `error` |
| `message` | string | Yes | Example: `Something went wrong` |

### Schema: `SuccessResponse`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `status` | string | No | Example: `success` |
| `data` | object | No |  |

### Schema: `UserProfile`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `_id` | string | No | Example: `64f1a2b3c4d5e6f7a8b9c0d1` |
| `name` | string | No | Example: `Yousuf Ahmed` |
| `username` | string | No | Example: `yousuf_dev` |
| `email` | string | No | Example: `yousuf@test.com` |
| `avatarUrl` | string | No | Example: `https://res.cloudinary.com/...` |
| `bio` | string | No | Example: `Full-stack dev` |
| `publicKey` | string | No | Example: `-----BEGIN PUBLIC KEY-----...` — nullable |
| `isPrivate` | boolean | No | Example: `False` |
| `isProfileLocked` | boolean | No | Example: `False` |
| `friends` | array of string | No | Array of user IDs |
| `friendRequests` | array of string | No |  |
| `blockedUsers` | array of string | No |  |
| `mutedUsers` | array of string | No |  |
| `mutedGroups` | array of string | No |  |
| `lastSeen` | string | No |  |
| `createdAt` | string | No |  |
| `updatedAt` | string | No |  |

### Schema: `PublicUserSummary`

Limited user info returned in search results / friend lists

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `_id` | string | No |  |
| `name` | string | No |  |
| `username` | string | No |  |
| `avatarUrl` | string | No |  |
| `bio` | string | No |  |

### Schema: `LockedUserSummary`

Returned when profile is locked and requester is not a friend

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `_id` | string | No |  |
| `name` | string | No |  |
| `username` | string | No |  |
| `avatarUrl` | string | No |  |
| `isProfileLocked` | boolean | No | Example: `True` |

### Schema: `Message`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `_id` | string | No |  |
| `sender` | string | No |  |
| `receiver` | string | No | nullable |
| `group` | string | No | nullable |
| `content` | string | No | E2EE ciphertext or Cloudinary URL |
| `messageType` | string (text, image, video) | No |  |
| `isDisappearing` | boolean | No |  |
| `timerInSeconds` | number | No |  |
| `seenBy` | array of string | No |  |
| `reactions` | array of object | No |  |
| `createdAt` | string | No |  |

### Schema: `Group`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `_id` | string | No |  |
| `groupName` | string | No |  |
| `groupIcon` | string | No |  |
| `creator` | string | No |  |
| `members` | array of string | No |  |
| `encryptedGroupKeys` | array of object | No |  |
| `createdAt` | string | No |  |

### Schema: `Post`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `_id` | string | No |  |
| `author` | string | No |  |
| `textContent` | string | No | E2EE ciphertext |
| `mediaUrl` | string | No | nullable |
| `mediaType` | string (image, video, none) | No |  |
| `visibility` | string (public, friends) | No |  |
| `reactions` | array of object | No |  |
| `createdAt` | string | No |  |

### Schema: `Comment`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `_id` | string | No |  |
| `post` | string | No |  |
| `author` | string | No |  |
| `textContent` | string | No |  |
| `parentId` | string | No | nullable |
| `createdAt` | string | No |  |

### Schema: `MoodLog`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `_id` | string | No |  |
| `user` | string | No |  |
| `currentMood` | string (Happy, Sad, Angry, Missing You) | No |  |
| `date` | string | No |  |
| `createdAt` | string | No |  |

### Schema: `AuthResponse`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `status` | string | No | Example: `success` |
| `data` | object | No |  |

### Schema: `RefreshTokenResponse`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `status` | string | No | Example: `success` |
| `data` | object | No |  |

### Schema: `RegisterRequest`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `name` | string | Yes | Example: `Yousuf Ahmed` |
| `username` | string | Yes | Example: `yousuf_dev` |
| `email` | string | Yes | Example: `yousuf@test.com` |
| `password` | string | Yes | Example: `password123` |
| `publicKey` | string | No | Example: `-----BEGIN PUBLIC KEY-----...` |

### Schema: `LoginRequest`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `loginId` | string | Yes | Email or Username — Example: `yousuf_dev` |
| `password` | string | Yes | Example: `password123` |

### Schema: `SupabaseLoginRequest`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `accessToken` | string | Yes | Example: `supabase_access_token_here` |
| `publicKey` | string | No | Example: `-----BEGIN PUBLIC KEY-----...` |

### Schema: `RefreshTokenRequest`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `refreshToken` | string | Yes | Example: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |

### Schema: `CryptoVaultRestoreRequest`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `backupPin` | string | Yes | Example: `123456` |

### Schema: `UpdatePasswordRequest`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `oldPassword` | string | Yes | Example: `password123` |
| `newPassword` | string | Yes | Example: `newPassword123` |

### Schema: `UpdateProfileRequest`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `name` | string | No | Example: `Updated Name` |
| `bio` | string | No | Example: `My new bio` |
| `avatarUrl` | string | No | Example: `https://res.cloudinary.com/...` |
| `isPrivate` | boolean | No | Example: `False` |
| `publicKey` | string | No | Example: `-----BEGIN PUBLIC KEY-----...` |
| `fcmToken` | string | No | Example: `dummy_fcm_token` |

### Schema: `SendMessageRequest`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `receiverId` | string | No | For 1-to-1 chat — Example: `64f1a2b3c4d5e6f7a8b9c0d1` |
| `groupId` | string | No | For group chat — Example: `64f1a2b3c4d5e6f7a8b9c0d2` |
| `messageType` | string (text, image, video) | No | Example: `text` |
| `content` | string | Yes | E2EE Ciphertext or Cloudinary URL — Example: `U2FsdGVkX1...` |
| `isDisappearing` | boolean | No | Example: `False` |
| `timerInSeconds` | number | No | Example: `0` |
| `mediaPublicId` | string | No | Example: `dummy_public_id` |

### Schema: `ForwardMessageRequest`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `messageId` | string | Yes | Example: `64f1a2b3c4d5e6f7a8b9c0d5` |
| `receiverId` | string | No | Example: `64f1a2b3c4d5e6f7a8b9c0d1` |
| `groupId` | string | No | Example: `64f1a2b3c4d5e6f7a8b9c0d2` |
| `isDisappearing` | boolean | No | Example: `False` |
| `timerInSeconds` | number | No | Example: `0` |

### Schema: `BulkDeleteRequest`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `messageIds` | array of string | Yes | Example: `['64f1a2b3c4d5e6f7a8b9c0d6']` |

### Schema: `CreatePostRequest`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `textContent` | string | No | Example: `U2FsdGVkX1...encrypted_blob` |
| `mediaUrl` | string | No | Example: `https://res.cloudinary.com/...` |
| `mediaType` | string (image, video, none) | No | Example: `none` |
| `visibility` | string (public, friends) | No | Example: `public` |
| `mediaPublicId` | string | No | Example: `dummy_public_id` |

### Schema: `CreateCommentRequest`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `textContent` | string | Yes | Example: `U2FsdGVkX1...encrypted_comment` |
| `parentId` | string | No | For nested reply — Example: `64f1a2b3c4d5e6f7a8b9c0d3` |

### Schema: `CreateGroupRequest`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `groupName` | string | Yes | Example: `MERN Stack Team` |
| `groupIcon` | string | No | Example: `https://res.cloudinary.com/...` |
| `members` | array of string | No | Example: `['64f1a2b3c4d5e6f7a8b9c0d1']` |
| `encryptedGroupKeys` | array of object | No |  |

### Schema: `EditGroupRequest`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `groupName` | string | No | Example: `Updated Team Name` |
| `groupIcon` | string | No | Example: `https://res.cloudinary.com/new-icon.png` |

### Schema: `AddGroupMemberRequest`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `memberId` | string | Yes | Example: `64f1a2b3c4d5e6f7a8b9c0d4` |

### Schema: `RotateKeysRequest`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `encryptedGroupKeys` | array of object | Yes |  |

### Schema: `SocketInstantMessagePayload`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `receiverId` | string | No | For 1-to-1 message (required if groupId absent) |
| `groupId` | string | No | For group message (required if receiverId absent) |
| `messagePayload` | object | Yes |  |

### Schema: `SocketOfflineEvent`

| Field | Type | Required | Description / Example |
|---|---|---:|---|
| `event` | string | No | Example: `receive-message` |
| `payload` | object | No | Event-specific payload |

## Frontend implementation checklist

- [ ] Read the existing frontend structure and identify framework, routing, state management, and API client before changing files.
- [ ] Add environment-based API base URL configuration.
- [ ] Implement auth: register, login, Supabase login, refresh, forgot password, OTP verify, reset password, update password, logout, and current-user restore.
- [ ] Implement profile: read/update profile, profile lock, backup settings/status/timestamp, deletion request/cancel, and crypto-vault restore.
- [ ] Implement social: user search/profile/public-key lookup, friends, friend requests, unfriend, block/unblock, mute/unmute user/group.
- [ ] Implement messaging: send/forward/history, group history, read receipts/seen status, reactions, delete for everyone/me, clear chat for self/everyone, bulk delete, search, unread counts, disappearing-message UI.
- [ ] Implement groups: create/list/details/edit/leave/add/remove members and rotate encrypted group keys.
- [ ] Implement social feed: create/feed/user posts/details/edit/delete/react/toggle visibility.
- [ ] Implement comments and nested replies: list/create/edit/delete.
- [ ] Implement mood set/dashboard/history.
- [ ] Implement media signing/upload integration using the actual backend response fields.
- [ ] Implement Socket.IO presence, typing, live messages, offline event sync, and forced logout.
- [ ] Add loading/empty/error states, form validation, pagination, optimistic updates only where safe, and duplicate-event protection.
- [ ] Verify all request/response shapes against the backend code and test each operation.
- [ ] Run lint, type-check, tests, and production build; fix regressions without removing existing features.

## Important security and integration notes

1. **E2EE boundary:** `Message.content`, `Post.textContent`, and potentially comment content are described as encrypted client-side. Keep encryption and decryption in the client; never send private keys to the API except the documented encrypted-vault restoration flow.
2. **Token handling:** avoid logging or committing tokens. Use the repository's existing secure token-storage strategy rather than introducing a weaker one.
3. **Request body ambiguity:** some operations accept fields that are optional in the OpenAPI schema. Validate against controllers before assuming defaults.
4. **Responses are not uniformly wrapped:** some endpoints document `{status, data}`, while others document a raw object/array or only a short description. Code defensively and confirm actual controller responses.
5. **Error handling:** only treat status codes listed per endpoint as documented behavior; the backend may also return common errors not fully enumerated here.
6. **Media:** do not guess the upload signature or signed URL response properties. Inspect the actual response and existing Cloudinary integration before wiring the upload UI.
7. **No invented endpoints:** if a frontend feature appears to require an endpoint not listed here, search the backend `routes/` and `controllers/` folders first. Do not fabricate a path or silently change backend contracts.
8. **No unrelated refactors:** preserve all current features, styling, encryption behavior, and socket logic unless explicitly requested.

## Instructions for an AI coding agent

Use this README as the API integration contract and inspect the repository before editing. Implement the frontend against every documented HTTP endpoint and Socket.IO event that is relevant to the existing UI. Map each UI action to the correct method/path, auth requirement, params, and request body. Reuse existing components and patterns; do not invent API paths or payload fields. Where this README or OpenAPI leaves response details unspecified, inspect the backend route/controller implementation and document the actual contract in code. After implementation, report which endpoints/events are integrated, which are unused because no corresponding UI exists, and which need backend clarification. Do not claim an endpoint is implemented unless it has been wired and tested.

---

*Generated from `swagger.json` — OpenAPI 3.0.0 — Zero-Knowledge E2EE Social Engine.*