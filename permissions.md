# Permissions Model

## Roles

- `owner`: full board administration and content management.
- `editor`: content management and limited member management.
- `viewer`: read-only board access with comments support.

## Permissions Catalog

- Board: `board:create`, `board:list`, `board:read`, `board:update`, `board:delete`
- Columns: `column:create`, `column:update`, `column:reorder`, `column:delete`
- Cards: `card:create`, `card:update`, `card:move`, `card:delete`
- Comments: `comment:create`, `comment:delete:any`, `comment:delete:own`
- Members: `member:invite`, `member:update_role`, `member:remove`

## Role -> Permission Matrix

| Permission | owner | editor | viewer |
| --- | --- | --- | --- |
| `board:create` | ✅ | ✅ | ✅ |
| `board:list` | ✅ | ✅ | ✅ |
| `board:read` | ✅ | ✅ | ✅ |
| `board:update` | ✅ | ✅ | ❌ |
| `board:delete` | ✅ | ❌ | ❌ |
| `column:create` | ✅ | ✅ | ❌ |
| `column:update` | ✅ | ✅ | ❌ |
| `column:reorder` | ✅ | ✅ | ❌ |
| `column:delete` | ✅ | ✅ | ❌ |
| `card:create` | ✅ | ✅ | ❌ |
| `card:update` | ✅ | ✅ | ❌ |
| `card:move` | ✅ | ✅ | ❌ |
| `card:delete` | ✅ | ✅ | ❌ |
| `comment:create` | ✅ | ✅ | ✅ |
| `comment:delete:any` | ✅ | ✅ | ❌ |
| `comment:delete:own` | ✅ | ✅ | ✅ |
| `member:invite` | ✅ | ✅ | ❌ |
| `member:update_role` | ✅ | ❌ | ❌ |
| `member:remove` | ✅ | ✅ | ❌ |

## Endpoint -> Required Permission

### Boards

- `POST /boards` -> `board:create`
- `GET /boards` -> `board:list`
- `GET /boards/:id` -> `board:read`
- `PATCH /boards/:id` -> `board:update`
- `DELETE /boards/:id` -> `board:delete`
- `POST /boards/:boardId/members` -> `member:invite`
- `PATCH /boards/:boardId/members/:memberUserId/role` -> `member:update_role`
- `DELETE /boards/:boardId/members/:memberUserId` -> `member:remove`

### Columns

- `POST /columns` -> `column:create`
- `PATCH /columns/reorder` -> `column:reorder`
- `PATCH /columns/:id` -> `column:update`
- `DELETE /columns/:id` -> `column:delete`

### Cards

- `POST /cards` -> `card:create`
- `PATCH /cards/:id` -> `card:update`
- `PATCH /cards/:id/move` -> `card:move`
- `DELETE /cards/:id` -> `card:delete`
- `POST /cards/:id/comments` -> `comment:create`
- `DELETE /cards/:id/comments/:commentId` -> `comment:delete:any` or `comment:delete:own`

### WebSocket

- `joinBoard` -> `board:read`

## Invariants

- The last `owner` cannot be removed or demoted.
- `editor` cannot update roles.
- `editor` cannot remove `owner`.
- `viewer` cannot modify board structure or cards.
- Comment delete is allowed when:
  - user has `comment:delete:any`, or
  - user has `comment:delete:own` and is comment author.

## Rollout Checklist

- [x] Board membership (`BoardMember`) and owner auto-membership.
- [x] Centralized role/permission policy map.
- [x] Guard + decorator permission enforcement.
- [x] Endpoint permission migration (`boards`, `columns`, `cards`).
- [x] WebSocket `joinBoard` permission check.
- [x] Member management endpoints.
- [x] Card soft delete endpoint.
- [x] E2E coverage for role-based access cases.
