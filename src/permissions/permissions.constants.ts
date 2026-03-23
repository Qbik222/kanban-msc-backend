export const BOARD_ROLES = ['owner', 'editor', 'viewer'] as const;

export type BoardRole = (typeof BOARD_ROLES)[number];

export const PERMISSIONS = [
  'board:create',
  'board:list',
  'board:read',
  'board:update',
  'board:delete',
  'column:create',
  'column:update',
  'column:reorder',
  'column:delete',
  'card:create',
  'card:update',
  'card:move',
  'card:delete',
  'comment:create',
  'comment:delete:any',
  'comment:delete:own',
  'member:invite',
  'member:update_role',
  'member:remove',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const viewerPermissions: Permission[] = [
  'board:list',
  'board:read',
  'comment:create',
  'comment:delete:own',
];

const editorPermissions: Permission[] = [
  ...viewerPermissions,
  'board:update',
  'column:create',
  'column:update',
  'column:reorder',
  'column:delete',
  'card:create',
  'card:update',
  'card:move',
  'card:delete',
  'comment:delete:any',
  'member:invite',
  'member:remove',
];

const ownerPermissions: Permission[] = [
  ...editorPermissions,
  'board:delete',
  'member:update_role',
];

export const ROLE_PERMISSIONS: Record<BoardRole, Set<Permission>> = {
  viewer: new Set(viewerPermissions),
  editor: new Set(editorPermissions),
  owner: new Set(ownerPermissions),
};
