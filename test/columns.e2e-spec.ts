import { ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { INestApplication } from '@nestjs/common';
import { Connection, Types } from 'mongoose';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';

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

  it('columns: create/reorder/update/delete + ws + cascade', async () => {
    const token = await registerAndLogin(
      app,
      'tc_columns_01@example.com',
      'password123',
      'TC Columns 01',
    );

    const boardRes = await request(app.getHttpServer())
      .post('/boards')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Board for columns e2e' })
      .expect(201);

    const boardId = boardRes.body.id as string;

    const joinedPromise = waitForSocketEvent<{ boardId: string }>(socket, 'board:joined');
    socket.emit('joinBoard', { boardId });
    const joined = await joinedPromise;
    expect(joined.boardId).toBe(boardId);

    // Create first column
    const col1UpdatedP = waitForSocketEvent<{ boardId: string; columns: any[] }>(
      socket,
      'columns:updated',
    );
    const col1Res = await request(app.getHttpServer())
      .post('/columns')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Col A', boardId })
      .expect(201);
    const col1Payload = await col1UpdatedP;
    expect(col1Payload.boardId).toBe(boardId);
    expect(col1Payload.columns).toHaveLength(1);
    expect(col1Payload.columns[0].id).toBe(col1Res.body.id);
    expect(col1Payload.columns[0].order).toBe(0);

    // Create second column
    const col2UpdatedP = waitForSocketEvent<{ boardId: string; columns: any[] }>(
      socket,
      'columns:updated',
    );
    const col2Res = await request(app.getHttpServer())
      .post('/columns')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Col B', boardId })
      .expect(201);
    const col2Payload = await col2UpdatedP;
    expect(col2Payload.boardId).toBe(boardId);
    expect(col2Payload.columns).toHaveLength(2);
    expect(col2Payload.columns[0].order).toBe(0);
    expect(col2Payload.columns[1].order).toBe(1);

    // Reorder: swap A and B
    const reorderUpdatedP = waitForSocketEvent<{ boardId: string; columns: any[] }>(
      socket,
      'columns:updated',
    );
    await request(app.getHttpServer())
      .patch('/columns/reorder')
      .set('Authorization', `Bearer ${token}`)
      .send({
        columns: [
          { id: col2Res.body.id, order: 0 },
          { id: col1Res.body.id, order: 1 },
        ],
      })
      .expect(200);

    const reorderPayload = await reorderUpdatedP;
    expect(reorderPayload.boardId).toBe(boardId);
    expect(reorderPayload.columns[0].id).toBe(col2Res.body.id);
    expect(reorderPayload.columns[1].id).toBe(col1Res.body.id);
    expect(reorderPayload.columns[0].order).toBe(0);
    expect(reorderPayload.columns[1].order).toBe(1);

    const boardAfterReorder = await request(app.getHttpServer())
      .get(`/boards/${boardId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(boardAfterReorder.body.columns[0].id).toBe(col2Res.body.id);
    expect(boardAfterReorder.body.columns[1].id).toBe(col1Res.body.id);

    // Rename column A (now second)
    const renameUpdatedP = waitForSocketEvent<{ boardId: string; columns: any[] }>(
      socket,
      'columns:updated',
    );
    await request(app.getHttpServer())
      .patch(`/columns/${col1Res.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Col A (renamed)' })
      .expect(200);

    await renameUpdatedP;

    const boardAfterRename = await request(app.getHttpServer())
      .get(`/boards/${boardId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const renamedCol = boardAfterRename.body.columns.find((c: any) => c.id === col1Res.body.id);
    expect(renamedCol.title).toBe('Col A (renamed)');

    // Insert a card into column A to test cascade soft delete
    await dbConnection.collection('cards').insertOne({
      title: 'Card in Col A',
      description: 'Card description',
      columnId: new Types.ObjectId(col1Res.body.id),
      boardId: new Types.ObjectId(boardId),
      order: 0,
      isDeleted: false,
      projectIds: [],
      priority: 'medium',
      comments: [],
    });

    // Delete column A (soft delete)
    const deleteUpdatedP = waitForSocketEvent<{ boardId: string; columns: any[] }>(
      socket,
      'columns:updated',
    );
    const deleteRes = await request(app.getHttpServer())
      .delete(`/columns/${col1Res.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      ;

    if (deleteRes.status !== 200) {
      // eslint-disable-next-line no-console
      console.log('DELETE /columns failed:', deleteRes.status, deleteRes.body);
    }

    expect(deleteRes.status).toBe(200);

    const deletePayload = await deleteUpdatedP;
    expect(deletePayload.boardId).toBe(boardId);
    expect(deletePayload.columns.some((c: any) => c.id === col1Res.body.id)).toBe(false);

    const boardAfterDelete = await request(app.getHttpServer())
      .get(`/boards/${boardId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(boardAfterDelete.body.columns.some((c: any) => c.id === col1Res.body.id)).toBe(false);

    // Cascade assertion: cards of deleted column must be isDeleted:true
    const cardsInDeletedColumn = await dbConnection.collection('cards').find({
      columnId: new Types.ObjectId(col1Res.body.id),
    }).toArray();

    const hasDeletedCard = cardsInDeletedColumn.some((c: any) => c.isDeleted === true);
    expect(hasDeletedCard).toBe(true);
  });
});

