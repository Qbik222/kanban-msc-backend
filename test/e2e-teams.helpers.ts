import { INestApplication } from '@nestjs/common';
import request from 'supertest';

export async function createTeam(
  app: INestApplication,
  token: string,
  name: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/teams')
    .set('Authorization', `Bearer ${token}`)
    .send({ name })
    .expect(201);
  return res.body.id as string;
}

export async function addTeamMember(
  app: INestApplication,
  adminToken: string,
  teamId: string,
  userId: string,
): Promise<void> {
  await request(app.getHttpServer())
    .post(`/teams/${teamId}/members`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ userId })
    .expect(201);
}

export async function createBoard(
  app: INestApplication,
  token: string,
  title: string,
  teamId: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/boards')
    .set('Authorization', `Bearer ${token}`)
    .send({ title, teamId })
    .expect(201);
  return res.body.id as string;
}

export async function setTeamMemberRole(
  app: INestApplication,
  adminToken: string,
  teamId: string,
  memberUserId: string,
  role: 'admin' | 'user',
): Promise<void> {
  await request(app.getHttpServer())
    .patch(`/teams/${teamId}/members/${memberUserId}/role`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ role })
    .expect(200);
}
