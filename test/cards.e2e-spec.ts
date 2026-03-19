import { ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';

jest.setTimeout(30000);

function waitForSocketEvent<T>(socket: Socket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for socket event "${event}"`));
    }, timeoutMs);

    socket.once(event, (payload: T) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
}

async function registerAndLogin(app: INestApplication, email: string, password: string, name: string) {
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password, name })
    .expect(201);

  const loginRes = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(200);

  return loginRes.body.accessToken as string;
}

describe('Cards E2E', () => {
  let app: INestApplication;
  let dbConnection: Connection;
  let socket: Socket;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    dbConnection = app.get<Connection>(getConnectionToken());

    const httpServer: any = await app.listen(0);
    const address = httpServer?.address?.();
    const port = address?.port;
    if (!port) throw new Error('Could not determine random server port');

    socket = io(`http://localhost:${port}`, {
      transports: ['websocket'],
      forceNew: true,
    });

    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', (err: any) => reject(err));
    });
  });

  beforeEach(async () => {
    if (dbConnection && dbConnection.readyState === 1) {
      await dbConnection.collection('cards').deleteMany({});
      await dbConnection.collection('columns').deleteMany({});
      await dbConnection.collection('boards').deleteMany({});
      await dbConnection.collection('users').deleteMany({});
    }
  });

  afterAll(async () => {
    if (socket?.connected) socket.disconnect();
    if (dbConnection && dbConnection.readyState !== 0) {
      await dbConnection.dropDatabase();
      await dbConnection.close();
    }
    await app.close();
  });

  it('cards: create/update/move/comments + ws events + ordering + deadline validation', async () => {
    const token = await registerAndLogin(
      app,
      'tc_cards_01@example.com',
      'password123',
      'TC Cards 01',
    );

    const boardRes = await request(app.getHttpServer())
      .post('/boards')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Board for cards e2e' })
      .expect(201);

    const boardId = boardRes.body.id as string;

    const joinedPromise = waitForSocketEvent<{ boardId: string }>(socket, 'board:joined');
    socket.emit('joinBoard', { boardId });
    const joined = await joinedPromise;
    expect(joined.boardId).toBe(boardId);

    // Create columns (source and target)
    const col1Res = await request(app.getHttpServer())
      .post('/columns')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Col 1', boardId })
      .expect(201);
    const col1Id = col1Res.body.id as string;

    const col2Res = await request(app.getHttpServer())
      .post('/columns')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Col 2', boardId })
      .expect(201);
    const col2Id = col2Res.body.id as string;

    // Create 3 cards in col1: will have orders 0..2
    const card1CreatedP = waitForSocketEvent<any>(socket, 'card:created');
    const card1Http = await request(app.getHttpServer())
      .post('/cards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Card 1',
        description: 'Description 1',
        columnId: col1Id,
        deadline: { startDate: '2026-03-19T09:00:00.000Z', endDate: '2026-03-20T09:00:00.000Z' },
      })
      .expect(201);
    const card1Ws = await card1CreatedP;
    expect(card1Ws.id).toBe(card1Http.body.id);

    const card2CreatedP = waitForSocketEvent<any>(socket, 'card:created');
    const card2Http = await request(app.getHttpServer())
      .post('/cards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Card 2',
        description: 'Description 2',
        columnId: col1Id,
      })
      .expect(201);
    await card2CreatedP;
    const card2Id = card2Http.body.id as string;

    const card3CreatedP = waitForSocketEvent<any>(socket, 'card:created');
    const card3Http = await request(app.getHttpServer())
      .post('/cards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Card 3',
        description: 'Description 3',
        columnId: col1Id,
      })
      .expect(201);
    await card3CreatedP;
    const card3Id = card3Http.body.id as string;

    // Negative deadline validation (400)
    await request(app.getHttpServer())
      .patch(`/cards/${card2Id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        deadline: { startDate: '2026-03-21T09:00:00.000Z', endDate: '2026-03-20T09:00:00.000Z' },
      })
      .expect(400);

    // Update card (card:updated)
    const cardUpdatedP = waitForSocketEvent<any>(socket, 'card:updated');
    await request(app.getHttpServer())
      .patch(`/cards/${card2Id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Card 2 updated' })
      .expect(200);
    const cardUpdatedWs = await cardUpdatedP;
    expect(cardUpdatedWs.id).toBe(card2Id);
    expect(cardUpdatedWs.title).toBe('Card 2 updated');

    // Move within same column: move Card 2 to order=0 => [Card2, Card1, Card3]
    const movedWithinP = waitForSocketEvent<any>(socket, 'card:moved');
    await request(app.getHttpServer())
      .patch(`/cards/${card2Id}/move`)
      .set('Authorization', `Bearer ${token}`)
      .send({ targetColumnId: col1Id, newOrder: 0 })
      .expect(200);
    const movedWithinSnapshot = await movedWithinP;

    const col1InSnapshot = movedWithinSnapshot.columns.find((c: any) => c.id === col1Id);
    const movedOrders = col1InSnapshot.cards.map((c: any) => c.id);
    expect(movedOrders).toEqual([card2Id, card1Http.body.id, card3Id]);

    // Prepare move between columns: create a card in col2 so insertion order is deterministic
    const col2CardCreatedP = waitForSocketEvent<any>(socket, 'card:created');
    const col2CardHttp = await request(app.getHttpServer())
      .post('/cards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Target Card in Col2',
        description: 'Target Description',
        columnId: col2Id,
      })
      .expect(201);
    await col2CardCreatedP;
    const col2CardId = col2CardHttp.body.id as string;

    // Move between columns: move Card 3 to col2 at newOrder=0
    const movedBetweenP = waitForSocketEvent<any>(socket, 'card:moved');
    await request(app.getHttpServer())
      .patch(`/cards/${card3Id}/move`)
      .set('Authorization', `Bearer ${token}`)
      .send({ targetColumnId: col2Id, newOrder: 0 })
      .expect(200);
    const movedBetweenSnapshot = await movedBetweenP;

    const col1AfterMoveBetween = movedBetweenSnapshot.columns.find((c: any) => c.id === col1Id);
    const col2AfterMoveBetween = movedBetweenSnapshot.columns.find((c: any) => c.id === col2Id);

    const col2Ids = col2AfterMoveBetween.cards.map((c: any) => c.id);
    expect(col2Ids).toEqual([card3Id, col2CardId]);

    const col1Ids = col1AfterMoveBetween.cards.map((c: any) => c.id);
    // Source column cards should remain in their relative order excluding moved Card3
    expect(col1Ids).toEqual([card2Id, card1Http.body.id]);

    // Comments: add + delete with WS events
    const commentAddedP = waitForSocketEvent<any>(socket, 'comment:added');
    const commentAddHttp = await request(app.getHttpServer())
      .post(`/cards/${card3Id}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Looks good!' })
      .expect(201);
    const commentAddedWs = await commentAddedP;
    expect(commentAddedWs.id).toBe(card3Id);
    expect(commentAddedWs.comments).toHaveLength(1);
    expect(commentAddedWs.comments[0].text).toBe('Looks good!');

    const commentId = (commentAddHttp.body.comments[0]._id as string) ?? (commentAddedWs.comments[0]._id as string);
    expect(commentId).toBeTruthy();

    const commentDeletedWsP = waitForSocketEvent<any>(socket, 'card:updated');
    await request(app.getHttpServer())
      .delete(`/cards/${card3Id}/comments/${commentId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const commentDeletedWs = await commentDeletedWsP;
    expect(commentDeletedWs.id).toBe(card3Id);
    expect(commentDeletedWs.comments).toHaveLength(0);

    const boardSnapshot = await request(app.getHttpServer())
      .get(`/boards/${boardId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const movedCardInSnapshot = boardSnapshot.body.columns
      .find((c: any) => c.id === col2Id)
      .cards.find((c: any) => c.id === card3Id);
    expect(movedCardInSnapshot.comments).toHaveLength(0);
  });
});

