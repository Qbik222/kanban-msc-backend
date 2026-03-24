export const TEAM_ROLES = ['admin', 'user'] as const;

export type TeamRole = (typeof TEAM_ROLES)[number];
