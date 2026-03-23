import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { setupE2EHttpApp } from './setup-e2e-app';

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

async function registerAndLogin(
  app: INestApplication,
  email: string,
  password: string,
  name: string,
): Promise<string> {
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

describe('Boards E2E', () => {
  let app: INestApplication;
  let dbConnection: Connection;
  let socket: Socket;

  async function createBoardAndJoin(token: string, title: string): Promise<string> {
    const boardRes = await request(app.getHttpServer())
      .post('/boards')
      .set('Authorization', `Bearer ${token}`)
      .send({ title })
      .expect(201);

    const boardId = boardRes.body.id as string;

    const joinedPromise = waitForSocketEvent<{ boardId: string }>(socket, 'board:joined');
    socket.emit('joinBoard', { boardId, token });
    await joinedPromise;

    return boardId;
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

  it('API-09: PATCH /boards/:id -> ws board:updated + GET /boards/:id updated', async () => {
    const token = await registerAndLogin(app, 'tc_boards_01@example.com', 'password123', 'TC Boards 01');
    const boardId = await createBoardAndJoin(token, 'Board for ws updates');

    const patchUpdatedPromise = waitForSocketEvent<any>(socket, 'board:updated');
    await request(app.getHttpServer())
      .patch(`/boards/${boardId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Board title updated' })
      .expect(200);

    const updatedPayload = await patchUpdatedPromise;
    expect(updatedPayload.id).toBe(boardId);
    expect(updatedPayload.title).toBe('Board title updated');

    const boardAfterPatch = await request(app.getHttpServer())
      .get(`/boards/${boardId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(boardAfterPatch.body.title).toBe('Board title updated');
  });

  it('API-10: DELETE /boards/:id -> ws board:deleted + GET /boards/:id 404 after soft delete', async () => {
    const token = await registerAndLogin(app, 'tc_boards_02@example.com', 'password123', 'TC Boards 02');
    const boardId = await createBoardAndJoin(token, 'Board for ws delete');

    const deleteUpdatedPromise = waitForSocketEvent<any>(socket, 'board:deleted');
    await request(app.getHttpServer())
      .delete(`/boards/${boardId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const deletedPayload = await deleteUpdatedPromise;
    expect(deletedPayload.id).toBe(boardId);
    expect(deletedPayload.isDeleted).toBe(true);

    await request(app.getHttpServer())
      .get(`/boards/${boardId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});

