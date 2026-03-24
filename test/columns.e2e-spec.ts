import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { INestApplication } from '@nestjs/common';
import { Connection, Types } from 'mongoose';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { setupE2EHttpApp } from './setup-e2e-app';
import { createBoard, createTeam } from './e2e-teams.helpers';

jest.setTimeout(30000);

function waitForSocketEvent<T>(
  socket: Socket,
  event: string,
  timeoutMs = 5000,
): Promise<T> {
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

describe('Columns E2E', () => {
  let app: INestApplication;
  let dbConnection: Connection;
  let socket: Socket;

  async function createBoardAndJoin(token: string, title: string): Promise<string> {
    const teamId = await createTeam(app, token, `Team ${title}`);
    const boardId = await createBoard(app, token, title, teamId);

    const joinedPromise = waitForSocketEvent<{ boardId: string }>(socket, 'board:joined');
    socket.emit('joinBoard', { boardId, token });
    await joinedPromise;

    return boardId;
  }

  async function createColumnAndWait(
    token: string,
    boardId: string,
    title: string,
  ): Promise<{ columnId: string; columnsPayload: any }> {
    const columnsUpdatedP = waitForSocketEvent<{ boardId: string; columns: any[] }>(
      socket,
      'columns:updated',
    );

    const colRes = await request(app.getHttpServer())
      .post('/columns')
      .set('Authorization', `Bearer ${token}`)
      .send({ title, boardId })
      .expect(201);

    const payload = await columnsUpdatedP;
    expect(payload.boardId).toBe(boardId);
    expect(payload.columns.some((c) => c.id === colRes.body.id)).toBe(true);

    return { columnId: colRes.body.id as string, columnsPayload: payload };
  }

  async function reorderColumnsAndWait(
    token: string,
    payloadBody: { columns: { id: string; order: number }[] },
  ): Promise<{ boardId: string; columns: any[] }> {
    const columnsUpdatedP = waitForSocketEvent<{ boardId: string; columns: any[] }>(
      socket,
      'columns:updated',
    );

    await request(app.getHttpServer())
      .patch('/columns/reorder')
      .set('Authorization', `Bearer ${token}`)
      .send(payloadBody)
      .expect(200);

    return columnsUpdatedP;
  }

  async function renameColumnAndWait(
    token: string,
    columnId: string,
    newTitle: string,
  ): Promise<{ boardId: string; columns: any[] }> {
    const columnsUpdatedP = waitForSocketEvent<{ boardId: string; columns: any[] }>(
      socket,
      'columns:updated',
    );

    await request(app.getHttpServer())
      .patch(`/columns/${columnId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: newTitle })
      .expect(200);

    return columnsUpdatedP;
  }

  async function deleteColumnAndWait(
    token: string,
    columnId: string,
  ): Promise<{ boardId: string; columns: any[] }> {
    const columnsUpdatedP = waitForSocketEvent<{ boardId: string; columns: any[] }>(
      socket,
      'columns:updated',
    );

    await request(app.getHttpServer())
      .delete(`/columns/${columnId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    return columnsUpdatedP;
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

  it('API-03: joinBoard => ws board:joined', async () => {
    const token = await registerAndLogin(app, 'tc_columns_01@example.com', 'password123', 'TC Columns 01');
    const boardId = await createBoardAndJoin(token, 'Board for columns e2e');
    expect(typeof boardId).toBe('string');
    expect(boardId.length).toBeGreaterThan(0);
  });

  it('API-04: POST /columns (1st column) => ws columns:updated', async () => {
    const token = await registerAndLogin(app, 'tc_columns_02@example.com', 'password123', 'TC Columns 02');
    const boardId = await createBoardAndJoin(token, 'Board for columns e2e (API-04)');

    const { columnId, columnsPayload } = await createColumnAndWait(token, boardId, 'Col A');
    expect(columnsPayload.columns).toHaveLength(1);
    expect(columnsPayload.columns[0].id).toBe(columnId);
    expect(columnsPayload.columns[0].order).toBe(0);
  });

  it('API-05: POST /columns (2nd column) => ws columns:updated with orders [0,1]', async () => {
    const token = await registerAndLogin(app, 'tc_columns_03@example.com', 'password123', 'TC Columns 03');
    const boardId = await createBoardAndJoin(token, 'Board for columns e2e (API-05)');

    await createColumnAndWait(token, boardId, 'Col A');
    const { columnsPayload } = await createColumnAndWait(token, boardId, 'Col B');

    expect(columnsPayload.columns).toHaveLength(2);
    expect(columnsPayload.columns[0].order).toBe(0);
    expect(columnsPayload.columns[1].order).toBe(1);
  });

  it('API-06: PATCH /columns/reorder => ws columns:updated + GET /boards/:id order', async () => {
    const token = await registerAndLogin(app, 'tc_columns_04@example.com', 'password123', 'TC Columns 04');
    const boardId = await createBoardAndJoin(token, 'Board for columns e2e (API-06)');

    const col1 = await createColumnAndWait(token, boardId, 'Col A');
    const col2 = await createColumnAndWait(token, boardId, 'Col B');

    const reorderPayload = await reorderColumnsAndWait(token, {
      columns: [
        { id: col2.columnId, order: 0 },
        { id: col1.columnId, order: 1 },
      ],
    });

    expect(reorderPayload.boardId).toBe(boardId);
    expect(reorderPayload.columns[0].id).toBe(col2.columnId);
    expect(reorderPayload.columns[1].id).toBe(col1.columnId);
    expect(reorderPayload.columns[0].order).toBe(0);
    expect(reorderPayload.columns[1].order).toBe(1);

    const boardAfterReorder = await request(app.getHttpServer())
      .get(`/boards/${boardId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(boardAfterReorder.body.columns[0].id).toBe(col2.columnId);
    expect(boardAfterReorder.body.columns[1].id).toBe(col1.columnId);
  });

  it('API-07: PATCH /columns/:id (rename) => ws columns:updated + GET /boards/:id', async () => {
    const token = await registerAndLogin(app, 'tc_columns_05@example.com', 'password123', 'TC Columns 05');
    const boardId = await createBoardAndJoin(token, 'Board for columns e2e (API-07)');

    const col1 = await createColumnAndWait(token, boardId, 'Col A');
    const renamePayload = await renameColumnAndWait(token, col1.columnId, 'Col A (renamed)');
    expect(renamePayload.columns.some((c: any) => c.id === col1.columnId)).toBe(true);

    const boardAfterRename = await request(app.getHttpServer())
      .get(`/boards/${boardId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const renamedCol = boardAfterRename.body.columns.find((c: any) => c.id === col1.columnId);
    expect(renamedCol.title).toBe('Col A (renamed)');
  });

  it('API-08: DELETE /columns/:id => cascade soft delete cards (Mongo isDeleted:true)', async () => {
    const token = await registerAndLogin(app, 'tc_columns_06@example.com', 'password123', 'TC Columns 06');
    const boardId = await createBoardAndJoin(token, 'Board for columns e2e (API-08)');

    const col1 = await createColumnAndWait(token, boardId, 'Col A');

    // Insert card into column to verify cascade soft delete
    await dbConnection.collection('cards').insertOne({
      title: 'Card in Col A',
      description: 'Card description',
      columnId: new Types.ObjectId(col1.columnId),
      boardId: new Types.ObjectId(boardId),
      order: 0,
      isDeleted: false,
      projectIds: [],
      priority: 'medium',
      comments: [],
    });

    const deletePayload = await deleteColumnAndWait(token, col1.columnId);
    expect(deletePayload.boardId).toBe(boardId);
    expect(deletePayload.columns.some((c: any) => c.id === col1.columnId)).toBe(false);

    const boardAfterDelete = await request(app.getHttpServer())
      .get(`/boards/${boardId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(boardAfterDelete.body.columns.some((c: any) => c.id === col1.columnId)).toBe(false);

    const cardsInDeletedColumn = await dbConnection.collection('cards').find({
      columnId: new Types.ObjectId(col1.columnId),
    }).toArray();

    expect(cardsInDeletedColumn.some((c: any) => c.isDeleted === true)).toBe(true);
  });
});

