import { CardCommentDto, CardResponseDto } from '../boards/dto/card-response.dto';
import { ColumnResponseDto } from '../boards/dto/column-response.dto';

export type PublicUserProfile = {
  id: string;
  name: string;
  avatarUrl?: string;
};

function mapId(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'toString' in value) {
    return String((value as { toString: () => string }).toString());
  }
  return '';
}

export function collectCommentAuthorIds(cards: any[]): string[] {
  const ids = new Set<string>();
  for (const card of cards) {
    const comments = Array.isArray(card?.comments) ? card.comments : [];
    for (const c of comments) {
      const id = mapId(c?.authorId);
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

export function collectCommentAuthorIdsFromColumns(columns: any[]): string[] {
  const cards: any[] = [];
  for (const col of columns) {
    if (Array.isArray(col?.cards)) cards.push(...col.cards);
  }
  return collectCommentAuthorIds(cards);
}

export function mapComment(
  c: any,
  authorsById: Map<string, PublicUserProfile>,
): CardCommentDto {
  const authorId = mapId(c?.authorId);
  const profile = authorsById.get(authorId);
  const name = profile?.name
    ?? (typeof c?.authorName === 'string' ? c.authorName : '')
    ?? '';
  const avatarUrl = profile?.avatarUrl
    ?? (typeof c?.authorAvatarUrl === 'string' ? c.authorAvatarUrl : undefined);

  const parentCommentId = c?.parentCommentId
    ? mapId(c.parentCommentId)
    : undefined;

  return {
    _id: mapId(c?._id ?? c?.id),
    text: c?.text ?? '',
    authorId,
    author: {
      id: authorId,
      name: name || 'Unknown',
      avatarUrl,
    },
    parentCommentId: parentCommentId || undefined,
    createdAt: c?.createdAt,
  };
}

export function mapCardResponse(
  card: any,
  authorsById: Map<string, PublicUserProfile> = new Map(),
): CardResponseDto {
  return {
    id: mapId(card?._id ?? card?.id),
    title: card?.title ?? '',
    description: card?.description ?? '',
    order: card?.order ?? 0,
    columnId: mapId(card?.columnId),
    boardId: mapId(card?.boardId),
    isDeleted: Boolean(card?.isDeleted),
    taskComplete: Boolean(card?.taskComplete),
    assigneeId: card?.assigneeId ? mapId(card.assigneeId) : undefined,
    deadline: card?.deadline
      ? {
          startDate: card.deadline.startDate,
          endDate: card.deadline.endDate,
        }
      : undefined,
    projectIds: Array.isArray(card?.projectIds)
      ? card.projectIds.map((id: any) => mapId(id))
      : [],
    priority: card?.priority ?? 'medium',
    comments: Array.isArray(card?.comments)
      ? card.comments.map((c: any) => mapComment(c, authorsById))
      : [],
    createdAt: card?.createdAt,
    updatedAt: card?.updatedAt,
  };
}

export function mapColumnResponse(
  column: any,
  authorsById: Map<string, PublicUserProfile> = new Map(),
): ColumnResponseDto {
  const cards = Array.isArray(column?.cards) ? column.cards : [];
  return {
    id: mapId(column?._id ?? column?.id),
    title: column?.title ?? '',
    order: column?.order ?? 0,
    boardId: mapId(column?.boardId),
    isDeleted: Boolean(column?.isDeleted),
    cards: cards.map((card: any) => mapCardResponse(card, authorsById)),
    createdAt: column?.createdAt,
    updatedAt: column?.updatedAt,
  };
}
