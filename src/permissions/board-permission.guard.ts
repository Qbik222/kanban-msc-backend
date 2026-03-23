import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsService } from './permissions.service';
import { Permission } from './permissions.constants';
import { REQUIRED_PERMISSIONS_KEY } from './require-permissions.decorator';

@Injectable()
export class BoardPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  private async resolveBoardId(req: any): Promise<string | null> {
    if (req.params?.boardId) return req.params.boardId;
    if (req.baseUrl?.includes('/boards') && req.params?.id) return req.params.id;
    if (req.body?.boardId) return req.body.boardId;

    if (req.baseUrl?.includes('/columns')) {
      if (req.params?.id) {
        return this.permissionsService.resolveBoardIdFromColumn(req.params.id);
      }
      if (Array.isArray(req.body?.columns) && req.body.columns.length > 0) {
        return this.permissionsService.resolveBoardIdFromColumn(req.body.columns[0].id);
      }
    }

    if (req.baseUrl?.includes('/cards') && req.params?.id) {
      return this.permissionsService.resolveBoardIdFromCard(req.params.id);
    }

    if (req.body?.targetColumnId) {
      return this.permissionsService.resolveBoardIdFromColumn(req.body.targetColumnId);
    }

    if (req.body?.columnId) {
      return this.permissionsService.resolveBoardIdFromColumn(req.body.columnId);
    }

    return null;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permissions = this.reflector.getAllAndOverride<Permission[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!permissions || permissions.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const userId = req?.user?.userId as string | undefined;
    if (!userId) return false;

    // Global-only permissions for authenticated users.
    if (permissions.includes('board:create')) {
      return true;
    }

    const boardId = await this.resolveBoardId(req);
    if (!boardId) {
      return false;
    }

    for (const permission of permissions) {
      const has = await this.permissionsService.hasPermission(userId, boardId, permission);
      if (!has) return false;
    }
    return true;
  }
}
