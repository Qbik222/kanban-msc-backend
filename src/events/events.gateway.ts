import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import { BoardResponseDto } from '../boards/dto/board-response.dto';
import { ColumnResponseDto } from '../boards/dto/column-response.dto';
import { CardResponseDto } from '../boards/dto/card-response.dto';
import { BoardDetailsResponseDto } from '../boards/dto/board-details-response.dto';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class EventsGateway {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  @SubscribeMessage('joinBoard')
  handleJoinBoard(
    @MessageBody() data: { boardId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    this.logger.log(`joinBoard: client ${client.id} joining board ${data.boardId}`);
    client.join(`board:${data.boardId}`);
    client.emit('board:joined', { boardId: data.boardId });
  }

  emitBoardUpdated(board: BoardResponseDto): void {
    this.server.to(`board:${board.id}`).emit('board:updated', board);
  }

  emitBoardDeleted(board: BoardResponseDto): void {
    this.server.to(`board:${board.id}`).emit('board:deleted', board);
  }

  emitColumnsUpdated(boardId: string, columns: ColumnResponseDto[]): void {
    this.server.to(`board:${boardId}`).emit('columns:updated', { boardId, columns });
  }

  emitCardCreated(boardId: string, card: CardResponseDto): void {
    this.server.to(`board:${boardId}`).emit('card:created', card);
  }

  emitCardMoved(boardId: string, boardSnapshot: BoardDetailsResponseDto): void {
    this.server.to(`board:${boardId}`).emit('card:moved', boardSnapshot);
  }

  emitCardUpdated(boardId: string, card: CardResponseDto): void {
    this.server.to(`board:${boardId}`).emit('card:updated', card);
  }

  emitCommentAdded(boardId: string, card: CardResponseDto): void {
    this.server.to(`board:${boardId}`).emit('comment:added', card);
  }
}
