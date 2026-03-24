import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupE2EHttpApp } from './setup-e2e-app';

jest.setTimeout(30000);

function cookieHeaderFromSetCookie(
  setCookie: string[] | undefined,
): string {
  if (!setCookie?.length) {
    return '';
  }
  return setCookie.map((c) => c.split(';')[0]).join('; ');
}

describe('Auth E2E', () => {
  let app: INestApplication;
  let dbConnection: Connection;
  const testMongoUri =
    process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/kanban_test';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    setupE2EHttpApp(app);
    await app.init();
    dbConnection = app.get<Connection>(getConnectionToken());
    console.log('testMongoUri', testMongoUri);
    console.log('E2E mongoose DB:', dbConnection.db?.databaseName);
  });

  afterAll(async () => {
    if (dbConnection && dbConnection.readyState !== 0) {
      await dbConnection.dropDatabase();
      await dbConnection.close();
    }
    await app.close();
  });

  beforeEach(async () => {
    if (dbConnection && dbConnection.readyState === 1) {
      await dbConnection.collection('refreshsessions').deleteMany({});
      await dbConnection.collection('users').deleteMany({});
    }
  });

  it('API-01: should register a new user', async () => {
    const payload = {
      email: 'tc01@example.com',
      password: 'password123',
      name: 'TC01 User',
    };

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send(payload)
      .expect(201);

    expect(res.body).toHaveProperty('user');
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('csrfToken');
    expect(res.body.user.email).toBe(payload.email.toLowerCase());
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.csrfToken).toBe('string');
    const setCookies = res.headers['set-cookie'] as string[] | undefined;
    expect(setCookies?.length).toBeGreaterThanOrEqual(2);
    expect(String(res.headers['set-cookie']).toLowerCase()).toContain(
      'httponly',
    );
    const csrfSetCookie = setCookies!.find((c) =>
      /^xsrf-token=/i.test(c.split(';')[0].trim()),
    );
    expect(csrfSetCookie).toBeDefined();
    expect(csrfSetCookie!.toLowerCase()).not.toContain('httponly');
    expect(csrfSetCookie!.toLowerCase()).toMatch(/path=\/(?:;|$)/);

    const createdUser = await dbConnection
      .collection('users')
      .findOne({ email: payload.email.toLowerCase() });

    expect(createdUser).toBeTruthy();
    expect(createdUser!.password).not.toBe(payload.password);
  });

  it('API-02: should login with valid credentials', async () => {
    const payload = {
      email: 'tc02@example.com',
      password: 'password123',
      name: 'TC02 User',
    };

    await request(app.getHttpServer())
      .post('/auth/register')
      .send(payload)
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: payload.email, password: payload.password })
      .expect(200);

    expect(loginRes.body).toHaveProperty('user');
    expect(loginRes.body).toHaveProperty('accessToken');
    expect(loginRes.body).toHaveProperty('csrfToken');
    expect(loginRes.body.user.email).toBe(payload.email.toLowerCase());

    const token = loginRes.body.accessToken as string;

    const meRes = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(meRes.body).toHaveProperty('email', payload.email.toLowerCase());
    expect(meRes.body).toHaveProperty('id');
    expect(meRes.body).toHaveProperty('name');
  });

  it('API-03: should refresh tokens with cookie and CSRF header', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/register')
      .send({
        email: 'tc03@example.com',
        password: 'password123',
        name: 'TC03',
      })
      .expect(201);

    const loginRes = await agent
      .post('/auth/login')
      .send({ email: 'tc03@example.com', password: 'password123' })
      .expect(200);

    const refreshRes = await agent
      .post('/auth/refresh')
      .set('X-CSRF-Token', loginRes.body.csrfToken)
      .expect(200);

    expect(refreshRes.body).toHaveProperty('accessToken');
    expect(refreshRes.body).toHaveProperty('csrfToken');
    expect(refreshRes.body.csrfToken).not.toBe(loginRes.body.csrfToken);

    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${refreshRes.body.accessToken}`)
      .expect(200);
  });

  it('API-03b: should refresh with X-XSRF-TOKEN and cookies (double-submit / cold start)', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'tc03b@example.com',
        password: 'password123',
        name: 'TC03b',
      })
      .expect(201);

    const cookieHeader = cookieHeaderFromSetCookie(
      loginRes.headers['set-cookie'] as string[] | undefined,
    );
    const csrf = loginRes.body.csrfToken as string;

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookieHeader)
      .set('X-XSRF-TOKEN', csrf)
      .expect(200);

    expect(refreshRes.body).toHaveProperty('accessToken');
    expect(refreshRes.body).toHaveProperty('csrfToken');
  });

  it('API-04: should reject reuse of rotated refresh token', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/register')
      .send({
        email: 'tc04@example.com',
        password: 'password123',
        name: 'TC04',
      })
      .expect(201);

    const loginRes = await agent
      .post('/auth/login')
      .send({ email: 'tc04@example.com', password: 'password123' })
      .expect(200);

    const oldCookieHeader = cookieHeaderFromSetCookie(
      loginRes.headers['set-cookie'] as string[] | undefined,
    );

    await agent
      .post('/auth/refresh')
      .set('X-CSRF-Token', loginRes.body.csrfToken)
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', oldCookieHeader)
      .set('X-CSRF-Token', loginRes.body.csrfToken)
      .expect(401);
  });

  it('API-05: should logout and clear refresh session', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/register')
      .send({
        email: 'tc05@example.com',
        password: 'password123',
        name: 'TC05',
      })
      .expect(201);

    const loginRes = await agent
      .post('/auth/login')
      .send({ email: 'tc05@example.com', password: 'password123' })
      .expect(200);

    await agent
      .post('/auth/logout')
      .set('X-CSRF-Token', loginRes.body.csrfToken)
      .expect(204);

    await agent
      .post('/auth/refresh')
      .set('X-CSRF-Token', loginRes.body.csrfToken)
      .expect(401);
  });
});
