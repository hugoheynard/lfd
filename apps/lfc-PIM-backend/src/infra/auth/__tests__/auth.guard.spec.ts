import { Controller, Get, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AccessTokenVerifier } from '../access-token.verifier.js';
import { AuthGuard } from '../auth.guard.js';
import { CurrentUser } from '../current-user.decorator.js';
import type { Principal } from '../principal.js';
import { Public } from '../public.decorator.js';

const principal: Principal = {
  subject: 'auth0|123',
  scopes: ['read:products'],
};

/** Contrôleur sonde : une route ouverte, une route protégée. */
@Controller()
class ProbeController {
  @Public()
  @Get('open')
  open(): string {
    return 'ok';
  }

  @Get('protected')
  protectedRoute(@CurrentUser() user: Principal): Principal {
    return user;
  }
}

/** Verifier factice : seul le jeton « good » est valide. */
const verifierStub = {
  verify: (token: string): Promise<Principal> =>
    token === 'good'
      ? Promise.resolve(principal)
      : Promise.reject(new Error('jeton refusé')),
};

describe('AuthGuard (intégration)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [
        { provide: AccessTokenVerifier, useValue: verifierStub },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('laisse passer une route @Public() sans jeton', async () => {
    await request(app.getHttpServer()).get('/open').expect(200).expect('ok');
  });

  it('refuse une route protégée sans en-tête Authorization', async () => {
    await request(app.getHttpServer()).get('/protected').expect(401);
  });

  it('refuse un schéma qui n’est pas Bearer', async () => {
    await request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', 'Basic abc')
      .expect(401);
  });

  it('refuse un Bearer sans valeur', async () => {
    await request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', 'Bearer')
      .expect(401);
  });

  it('refuse un jeton invalide', async () => {
    await request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', 'Bearer bad')
      .expect(401);
  });

  it('accepte un jeton valide et expose l’identité vérifiée', async () => {
    const response = await request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', 'Bearer good')
      .expect(200);

    expect(response.body).toEqual({
      subject: 'auth0|123',
      scopes: ['read:products'],
    });
  });
});
