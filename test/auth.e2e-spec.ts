import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import  request from 'supertest';
import mongoose from 'mongoose';

jest.setTimeout(30000);

describe('Auth E2E', () => {
  let app: INestApplication;
  const testMongoUri =
    process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/kanban_test';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    console.log('testMongoUri', testMongoUri);
    console.log('E2E mongoose DB:', mongoose.connection.db?.databaseName);
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
    await app.close();
  });

  beforeEach(async () => {
    const { connection } = mongoose;
    if (connection.readyState === 1) {
      await connection.collection('users').deleteMany({});
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
    expect(res.body.user.email).toBe(payload.email.toLowerCase());
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.accessToken.length).toBeGreaterThan(0);

    // Verify password is hashed in DB
    const createdUser = await mongoose.connection
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

    // Ensure user exists (register first)
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
});

