import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Types } from 'mongoose';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { setupE2EHttpApp } from './setup-e2e-app';

jest.setTimeout(30000);

function waitForSocketEvent<T>(socket: Socket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timeout waiting for socket event "${event}"`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
}

async function registerAndLogin(app: INestApplication, email: string, password: string, name: string): Promise<string> {
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password, name })
    .expect(201);

  const login = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(200);

  return login.body.accessToken as string;
}

describe('Permissions E2E', () => {
  let app: INestApplication;
  let dbConnection: Connection;
  let socket: Socket;

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
    const port = httpServer?.address?.()?.port;
    socket = io(`http://localhost:${port}`, {
      transports: ['websocket'],
      forceNew: true,
    });
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', (error: any) => reject(error));
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

  it('viewer cannot update board, owner can', async () => {
    const ownerToken = await registerAndLogin(app, 'perm_owner_1@example.com', 'password123', 'Owner 1');
    const editorToken = await registerAndLogin(app, 'perm_editor_1@example.com', 'password123', 'Editor 1');
    const viewerToken = await registerAndLogin(app, 'perm_viewer_1@example.com', 'password123', 'Viewer 1');

    const boardRes = await request(app.getHttpServer())
      .post('/boards')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Permissions Board 1' })
      .expect(201);
    const boardId = boardRes.body.id as string;

    const editorUser = await dbConnection.collection('users').findOne({ email: 'perm_editor_1@example.com' });
    const viewerUser = await dbConnection.collection('users').findOne({ email: 'perm_viewer_1@example.com' });
    const ownerUser = await dbConnection.collection('users').findOne({ email: 'perm_owner_1@example.com' });
    const tokenPayload = JSON.parse(Buffer.from(ownerToken.split('.')[1], 'base64url').toString('utf8'));
    expect(tokenPayload.sub).toBe(String(ownerUser?._id));

    const ownerMembership = await dbConnection.collection('boardmembers').findOne({
      boardId: new Types.ObjectId(boardId),
      userId: new Types.ObjectId(String(ownerUser?._id)),
      isDeleted: false,
    });
    expect(ownerMembership?.role).toBe('owner');

    await request(app.getHttpServer())
      .post(`/boards/${boardId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: String(editorUser?._id) })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/boards/${boardId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: String(viewerUser?._id) })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/boards/${boardId}/members/${String(editorUser?._id)}/role`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'editor' })
      .expect(200);

    const editorMembership = await dbConnection.collection('boardmembers').findOne({
      boardId: new Types.ObjectId(boardId),
      userId: new Types.ObjectId(String(editorUser?._id)),
      isDeleted: false,
    });
    expect(editorMembership).toBeTruthy();
    expect(editorMembership?.role).toBe('editor');

    await request(app.getHttpServer())
      .patch(`/boards/${boardId}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ title: 'Viewer rename attempt' })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/boards/${boardId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Owner renamed board' })
      .expect(200);
  });

  it('editor cannot change roles and cannot remove owner', async () => {
    const ownerToken = await registerAndLogin(app, 'perm_owner_2@example.com', 'password123', 'Owner 2');
    const editorToken = await registerAndLogin(app, 'perm_editor_2@example.com', 'password123', 'Editor 2');
    const viewerToken = await registerAndLogin(app, 'perm_viewer_2@example.com', 'password123', 'Viewer 2');

    const boardRes = await request(app.getHttpServer())
      .post('/boards')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Permissions Board 2' })
      .expect(201);
    const boardId = boardRes.body.id as string;

    const editorUser = await dbConnection.collection('users').findOne({ email: 'perm_editor_2@example.com' });
    const viewerUser = await dbConnection.collection('users').findOne({ email: 'perm_viewer_2@example.com' });
    const ownerUser = await dbConnection.collection('users').findOne({ email: 'perm_owner_2@example.com' });

    await request(app.getHttpServer())
      .post(`/boards/${boardId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: String(editorUser?._id) })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/boards/${boardId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: String(viewerUser?._id) })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/boards/${boardId}/members/${String(editorUser?._id)}/role`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'editor' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/boards/${boardId}/members/${String(viewerUser?._id)}/role`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ role: 'editor' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/boards/${boardId}/members/${String(ownerUser?._id)}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .expect(403);
  });

  it('owner can delete card and orders are recalculated', async () => {
    const ownerToken = await registerAndLogin(app, 'perm_owner_3@example.com', 'password123', 'Owner 3');
    const editorToken = await registerAndLogin(app, 'perm_editor_3@example.com', 'password123', 'Editor 3');

    const boardRes = await request(app.getHttpServer())
      .post('/boards')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Permissions Board 3' })
      .expect(201);
    const boardId = boardRes.body.id as string;

    const editorUser = await dbConnection.collection('users').findOne({ email: 'perm_editor_3@example.com' });

    await request(app.getHttpServer())
      .post(`/boards/${boardId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: String(editorUser?._id) })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/boards/${boardId}/members/${String(editorUser?._id)}/role`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'editor' })
      .expect(200);

    const columnRes = await request(app.getHttpServer())
      .post('/columns')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Todo', boardId })
      .expect(201);
    const columnId = columnRes.body.id as string;

    const card1 = await request(app.getHttpServer())
      .post('/cards')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Card 1', description: 'Desc 1', columnId })
      .expect(201);
    const card2 = await request(app.getHttpServer())
      .post('/cards')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Card 2', description: 'Desc 2', columnId })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/cards/${card1.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const boardSnapshot = await request(app.getHttpServer())
      .get(`/boards/${boardId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const activeCards = boardSnapshot.body.columns[0].cards;
    expect(activeCards).toHaveLength(1);
    expect(activeCards[0].id).toBe(card2.body.id);
    expect(activeCards[0].order).toBe(0);
  });

  it('outsider cannot join board room via websocket', async () => {
    const ownerToken = await registerAndLogin(app, 'perm_owner_4@example.com', 'password123', 'Owner 4');
    const outsiderToken = await registerAndLogin(app, 'perm_outsider_4@example.com', 'password123', 'Outsider 4');

    const boardRes = await request(app.getHttpServer())
      .post('/boards')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Permissions Board 4' })
      .expect(201);
    const boardId = boardRes.body.id as string;

    const joinError = waitForSocketEvent<{ message: string }>(socket, 'board:join_error');
    socket.emit('joinBoard', { boardId, token: outsiderToken });
    const payload = await joinError;

    expect(payload.message).toBe('Forbidden');
  });
});
