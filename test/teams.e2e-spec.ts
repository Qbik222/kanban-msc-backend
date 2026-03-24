import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupE2EHttpApp } from './setup-e2e-app';
import { createTeam, getTeam } from './e2e-teams.helpers';

jest.setTimeout(30000);

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

describe('Teams E2E', () => {
  let app: INestApplication;
  let dbConnection: Connection;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    setupE2EHttpApp(app);
    await app.init();
    dbConnection = app.get<Connection>(getConnectionToken());
    await app.listen(0);
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
    if (dbConnection && dbConnection.readyState !== 0) {
      await dbConnection.dropDatabase();
      await dbConnection.close();
    }
    await app.close();
  });

  it('GET /teams/:teamId returns team for member', async () => {
    const token = await registerAndLogin(app, 'teams_get_1@example.com', 'password123', 'Teams Get 1');
    const teamId = await createTeam(app, token, 'Alpha');

    const res = await getTeam(app, token, teamId).expect(200);
    expect(res.body.id).toBe(teamId);
    expect(res.body.name).toBe('Alpha');
  });

  it('GET /teams/:teamId returns 404 for non-member', async () => {
    const ownerToken = await registerAndLogin(app, 'teams_get_2a@example.com', 'password123', 'Teams 2a');
    const otherToken = await registerAndLogin(app, 'teams_get_2b@example.com', 'password123', 'Teams 2b');

    const teamId = await createTeam(app, ownerToken, 'Beta');

    await getTeam(app, otherToken, teamId).expect(404);
  });
});
