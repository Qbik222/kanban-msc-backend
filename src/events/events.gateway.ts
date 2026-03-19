import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class EventsGateway {
  @WebSocketServer()
  server!: Server;

  @SubscribeMessage('joinBoard')
  handleJoinBoard(
    @MessageBody() data: { boardId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    client.join(`board:${data.boardId}`);
  }

  emitBoardUpdated(boardId: string): void {
    this.server.to(`board:${boardId}`).emit('board:updated', { boardId });
  }

  emitBoardDeleted(boardId: string): void {
    this.server.to(`board:${boardId}`).emit('board:deleted', { boardId });
  }
}
