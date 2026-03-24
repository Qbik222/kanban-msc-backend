import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { setupE2EHttpApp } from './setup-e2e-app';
import { createBoard, createTeam } from './e2e-teams.helpers';

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

  async function setupUserBoardAndJoin(
    email: string,
    password: string,
    name: string,
    boardTitle: string,
  ): Promise<{ token: string; boardId: string }> {
    const token = await registerAndLogin(app, email, password, name);

    const teamId = await createTeam(app, token, `Team ${boardTitle}`);
    const boardId = await createBoard(app, token, boardTitle, teamId);

    const joinedPromise = waitForSocketEvent<{ boardId: string }>(socket, 'board:joined');
    socket.emit('joinBoard', { boardId, token });
    await joinedPromise;

    return { token, boardId };
  }

  async function createColumns(token: string, boardId: string): Promise<{ col1Id: string; col2Id: string }> {
    const col1Res = await request(app.getHttpServer())
      .post('/columns')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Col 1', boardId })
      .expect(201);

    const col2Res = await request(app.getHttpServer())
      .post('/columns')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Col 2', boardId })
      .expect(201);

    return { col1Id: col1Res.body.id as string, col2Id: col2Res.body.id as string };
  }

  async function createCardAndWait(
    token: string,
    columnId: string,
    cardPayload: {
      title: string;
      description?: string;
      deadline?: { startDate: string; endDate: string };
    },
  ): Promise<{ cardId: string; wsPayload: any; httpBody: any }> {
    const cardCreatedP = waitForSocketEvent<any>(socket, 'card:created');

    const body: Record<string, unknown> = {
      title: cardPayload.title,
      columnId,
    };
    if (cardPayload.description !== undefined) {
      body.description = cardPayload.description;
    }
    if (cardPayload.deadline) {
      body.deadline = cardPayload.deadline;
    }

    const httpRes = await request(app.getHttpServer())
      .post('/cards')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);

    const wsPayload = await cardCreatedP;
    expect(wsPayload.id).toBe(httpRes.body.id);

    return { cardId: httpRes.body.id as string, wsPayload, httpBody: httpRes.body };
  }

  async function updateCardAndWait(token: string, cardId: string, updatePayload: any): Promise<any> {
    const cardUpdatedP = waitForSocketEvent<any>(socket, 'card:updated');

    await request(app.getHttpServer())
      .patch(`/cards/${cardId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(updatePayload)
      .expect(200);

    const wsPayload = await cardUpdatedP;
    expect(wsPayload.id).toBe(cardId);
    return wsPayload;
  }

  async function moveCardAndWait(
    token: string,
    cardId: string,
    movePayload: { targetColumnId: string; newOrder: number },
  ): Promise<any> {
    const movedP = waitForSocketEvent<any>(socket, 'card:moved');

    await request(app.getHttpServer())
      .patch(`/cards/${cardId}/move`)
      .set('Authorization', `Bearer ${token}`)
      .send(movePayload)
      .expect(200);

    return movedP;
  }

  async function addCommentAndWait(token: string, cardId: string, text: string): Promise<any> {
    const commentAddedP = waitForSocketEvent<any>(socket, 'comment:added');

    const httpRes = await request(app.getHttpServer())
      .post(`/cards/${cardId}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text })
      .expect(201);

    const wsPayload = await commentAddedP;
    expect(wsPayload.id).toBe(cardId);
    expect(wsPayload.comments?.length).toBeGreaterThanOrEqual(1);

    return { wsPayload, httpBody: httpRes.body };
  }

  async function deleteCommentAndWait(token: string, cardId: string, commentId: string): Promise<any> {
    const cardUpdatedP = waitForSocketEvent<any>(socket, 'card:updated');

    await request(app.getHttpServer())
      .delete(`/cards/${cardId}/comments/${commentId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const wsPayload = await cardUpdatedP;
    expect(wsPayload.id).toBe(cardId);
    return wsPayload;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    setupE2EHttpApp(app);
    app.useWebSocketAdapter(new IoAdapter(app));

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
      await dbConnection.collection('boardmembers').deleteMany({});
      await dbConnection.collection('teammembers').deleteMany({});
      await dbConnection.collection('teams').deleteMany({});
      await dbConnection.collection('refreshsessions').deleteMany({});
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

  it('API-11: joinBoard => ws board:joined', async () => {
    const { token, boardId } = await setupUserBoardAndJoin(
      'tc_cards_01@example.com',
      'password123',
      'TC Cards 01',
      'Board for cards e2e (API-11)',
    );

    expect(token).toBeTruthy();
    expect(boardId).toBeTruthy();
  });

  it('API-12: POST /columns x2 (create columns)', async () => {
    const { token, boardId } = await setupUserBoardAndJoin(
      'tc_cards_02@example.com',
      'password123',
      'TC Cards 02',
      'Board for cards e2e (API-12)',
    );

    const { col1Id, col2Id } = await createColumns(token, boardId);

    const boardSnapshot = await request(app.getHttpServer())
      .get(`/boards/${boardId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(boardSnapshot.body.columns).toHaveLength(2);
    expect(boardSnapshot.body.columns[0].id).toBe(col1Id);
    expect(boardSnapshot.body.columns[1].id).toBe(col2Id);
  });

  it('API-13: POST /cards (with deadline) => ws card:created and card exists in GET /boards/:id', async () => {
    const { token, boardId } = await setupUserBoardAndJoin(
      'tc_cards_03@example.com',
      'password123',
      'TC Cards 03',
      'Board for cards e2e (API-13)',
    );

    const { col1Id } = await createColumns(token, boardId);

    const card1 = await createCardAndWait(token, col1Id, {
      title: 'Card 1',
      description: 'Description 1',
      deadline: { startDate: '2026-03-19T09:00:00.000Z', endDate: '2026-03-20T09:00:00.000Z' },
    });

    const boardSnapshot = await request(app.getHttpServer())
      .get(`/boards/${boardId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const movedCard = boardSnapshot.body.columns
      .find((c: any) => c.id === col1Id)
      .cards.find((c: any) => c.id === card1.cardId);

    expect(movedCard).toBeTruthy();
    expect(movedCard.deadline).toBeTruthy();
    expect(movedCard.deadline.startDate).toBe('2026-03-19T09:00:00.000Z');
    expect(movedCard.deadline.endDate).toBe('2026-03-20T09:00:00.000Z');
  });

  it('API-14: POST /cards => ws card:created', async () => {
    const { token, boardId } = await setupUserBoardAndJoin(
      'tc_cards_04@example.com',
      'password123',
      'TC Cards 04',
      'Board for cards e2e (API-14)',
    );

    const { col1Id } = await createColumns(token, boardId);
    const card2 = await createCardAndWait(token, col1Id, {
      title: 'Card 2',
      description: 'Description 2',
    });

    expect(card2.cardId).toBeTruthy();
    expect(card2.wsPayload.title).toBe('Card 2');
  });

  it('API-14b: POST /cards without description => empty string', async () => {
    const { token, boardId } = await setupUserBoardAndJoin(
      'tc_cards_04b@example.com',
      'password123',
      'TC Cards 04b',
      'Board for optional description',
    );

    const { col1Id } = await createColumns(token, boardId);
    const card = await createCardAndWait(token, col1Id, { title: 'Card no description' });

    expect(card.httpBody.description).toBe('');
    expect(card.wsPayload.description).toBe('');
  });

  it('API-15: POST /cards => ws card:created (another card)', async () => {
    const { token, boardId } = await setupUserBoardAndJoin(
      'tc_cards_05@example.com',
      'password123',
      'TC Cards 05',
      'Board for cards e2e (API-15)',
    );

    const { col1Id } = await createColumns(token, boardId);
    const card3 = await createCardAndWait(token, col1Id, {
      title: 'Card 3',
      description: 'Description 3',
    });

    expect(card3.cardId).toBeTruthy();
    expect(card3.wsPayload.title).toBe('Card 3');
  });

  it('API-16: PATCH /cards/:id (invalid deadline endDate < startDate) => 400', async () => {
    const { token, boardId } = await setupUserBoardAndJoin(
      'tc_cards_06@example.com',
      'password123',
      'TC Cards 06',
      'Board for cards e2e (API-16)',
    );

    const { col1Id } = await createColumns(token, boardId);
    const card = await createCardAndWait(token, col1Id, {
      title: 'Card to validate deadline',
      description: 'Description',
    });

    await request(app.getHttpServer())
      .patch(`/cards/${card.cardId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        deadline: {
          startDate: '2026-03-21T09:00:00.000Z',
          endDate: '2026-03-20T09:00:00.000Z',
        },
      })
      .expect(400);
  });

  it('API-17: PATCH /cards/:id => ws card:updated', async () => {
    const { token, boardId } = await setupUserBoardAndJoin(
      'tc_cards_07@example.com',
      'password123',
      'TC Cards 07',
      'Board for cards e2e (API-17)',
    );

    const { col1Id } = await createColumns(token, boardId);
    const card = await createCardAndWait(token, col1Id, {
      title: 'Card for update',
      description: 'Description',
    });

    const wsPayload = await updateCardAndWait(token, card.cardId, { title: 'Card updated' });
    expect(wsPayload.title).toBe('Card updated');
  });

  it('API-18: PATCH /cards/:id/move within same column => ws card:moved + order in snapshot', async () => {
    const { token, boardId } = await setupUserBoardAndJoin(
      'tc_cards_08@example.com',
      'password123',
      'TC Cards 08',
      'Board for cards e2e (API-18)',
    );

    const { col1Id } = await createColumns(token, boardId);
    const card1 = await createCardAndWait(token, col1Id, { title: 'Card 1', description: 'Description 1' });
    const card2 = await createCardAndWait(token, col1Id, { title: 'Card 2', description: 'Description 2' });
    const card3 = await createCardAndWait(token, col1Id, { title: 'Card 3', description: 'Description 3' });

    const movedSnapshot = await moveCardAndWait(token, card2.cardId, { targetColumnId: col1Id, newOrder: 0 });
    const col1InSnapshot = movedSnapshot.columns.find((c: any) => c.id === col1Id);
    const ids = col1InSnapshot.cards.map((c: any) => c.id);

    expect(ids).toEqual([card2.cardId, card1.cardId, card3.cardId]);
  });

  it('API-19: POST /cards in target column => ws card:created (prepare move between)', async () => {
    const { token, boardId } = await setupUserBoardAndJoin(
      'tc_cards_09@example.com',
      'password123',
      'TC Cards 09',
      'Board for cards e2e (API-19)',
    );

    const { col2Id } = await createColumns(token, boardId);
    const targetCard = await createCardAndWait(token, col2Id, {
      title: 'Target Card in Col2',
      description: 'Target Description',
    });

    expect(targetCard.wsPayload.id).toBe(targetCard.cardId);
  });

  it('API-20: PATCH /cards/:id/move between columns => ws card:moved + order in both columns', async () => {
    const { token, boardId } = await setupUserBoardAndJoin(
      'tc_cards_10@example.com',
      'password123',
      'TC Cards 10',
      'Board for cards e2e (API-20)',
    );

    const { col1Id, col2Id } = await createColumns(token, boardId);
    const card1 = await createCardAndWait(token, col1Id, { title: 'Card 1', description: 'Description 1' });
    const card2 = await createCardAndWait(token, col1Id, { title: 'Card 2', description: 'Description 2' });
    const card3 = await createCardAndWait(token, col1Id, { title: 'Card 3', description: 'Description 3' });
    const targetCard = await createCardAndWait(token, col2Id, { title: 'Target', description: 'Target Description' });

    const movedSnapshot = await moveCardAndWait(token, card3.cardId, { targetColumnId: col2Id, newOrder: 0 });

    const col1After = movedSnapshot.columns.find((c: any) => c.id === col1Id);
    const col2After = movedSnapshot.columns.find((c: any) => c.id === col2Id);

    const col2Ids = col2After.cards.map((c: any) => c.id);
    expect(col2Ids).toEqual([card3.cardId, targetCard.cardId]);

    const col1Ids = col1After.cards.map((c: any) => c.id);
    // sourceCards були зчитані відсортованими за order, тому після видалення moved card порядок зберігається
    expect(col1Ids).toEqual([card1.cardId, card2.cardId]);
  });

  it('API-21: POST /cards/:id/comments => ws comment:added', async () => {
    const { token, boardId } = await setupUserBoardAndJoin(
      'tc_cards_11@example.com',
      'password123',
      'TC Cards 11',
      'Board for cards e2e (API-21)',
    );

    const { col2Id } = await createColumns(token, boardId);
    const card = await createCardAndWait(token, col2Id, { title: 'Card for comments', description: 'Description' });

    const { wsPayload } = await addCommentAndWait(token, card.cardId, 'Looks good!');
    expect(wsPayload.comments).toHaveLength(1);
    expect(wsPayload.comments[0].text).toBe('Looks good!');
  });

  it('API-22: DELETE /cards/:id/comments/:commentId => ws card:updated (comments cleared)', async () => {
    const { token, boardId } = await setupUserBoardAndJoin(
      'tc_cards_12@example.com',
      'password123',
      'TC Cards 12',
      'Board for cards e2e (API-22)',
    );

    const { col2Id } = await createColumns(token, boardId);
    const card = await createCardAndWait(token, col2Id, { title: 'Card for comment delete', description: 'Description' });

    const { wsPayload: addedWs, httpBody: addedHttp } = await addCommentAndWait(token, card.cardId, 'Looks good!');
    const commentId =
      (addedHttp.comments?.[0]?._id as string | undefined) ?? (addedWs.comments?.[0]?._id as string | undefined);

    expect(commentId).toBeTruthy();

    const updatedWs = await deleteCommentAndWait(token, card.cardId, commentId as string);
    expect(updatedWs.comments).toHaveLength(0);
  });

  it('API-23: final snapshot GET /boards/:id after move + comment delete => moved card comments empty', async () => {
    const { token, boardId } = await setupUserBoardAndJoin(
      'tc_cards_13@example.com',
      'password123',
      'TC Cards 13',
      'Board for cards e2e (API-23)',
    );

    const { col1Id, col2Id } = await createColumns(token, boardId);
    const card1 = await createCardAndWait(token, col1Id, { title: 'Card 1', description: 'Description 1' });
    const card2 = await createCardAndWait(token, col1Id, { title: 'Card 2', description: 'Description 2' });
    const card3 = await createCardAndWait(token, col1Id, { title: 'Card 3', description: 'Description 3' });
    await createCardAndWait(token, col2Id, { title: 'Target', description: 'Target Description' });

    // Move card3 to col2 first
    await moveCardAndWait(token, card3.cardId, { targetColumnId: col2Id, newOrder: 0 });

    // Add comment then delete it
    const { wsPayload: addedWs, httpBody: addedHttp } = await addCommentAndWait(token, card3.cardId, 'Looks good!');
    const commentId =
      (addedHttp.comments?.[0]?._id as string | undefined) ?? (addedWs.comments?.[0]?._id as string | undefined);

    expect(commentId).toBeTruthy();
    await deleteCommentAndWait(token, card3.cardId, commentId as string);

    const boardSnapshot = await request(app.getHttpServer())
      .get(`/boards/${boardId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const movedCardInSnapshot = boardSnapshot.body.columns
      .find((c: any) => c.id === col2Id)
      .cards.find((c: any) => c.id === card3.cardId);

    expect(movedCardInSnapshot.comments).toHaveLength(0);
  });
});

