import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { API_BASE_URL } from '../api';
import { resetStaffToken, staffTokenInterceptor } from '../staff-token.interceptor';
import { SuiteEmbed } from '../../suite-embed/suite-embed';

const API = 'http://api.test';

/**
 * Ce que ces tests éprouvent : **qui** reçoit le jeton, et ce qui se passe quand
 * il expire. C'est là que se joue le mur — un jeton posé sur la mauvaise
 * requête est une fuite, et un jeton mémorisé pour toujours condamne l'onglet.
 */
class StubEmbed {
  calls: string[] = [];
  token: string | null = 'jeton-staff';

  requestToken(audience: string): Promise<string | null> {
    this.calls.push(audience);
    return Promise.resolve(this.token);
  }
}

let embed: StubEmbed;
let http: HttpClient;
let httpMock: HttpTestingController;

beforeEach(() => {
  resetStaffToken();
  embed = new StubEmbed();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([staffTokenInterceptor])),
      provideHttpClientTesting(),
      { provide: API_BASE_URL, useValue: API },
      { provide: SuiteEmbed, useValue: embed },
    ],
  });
  http = TestBed.inject(HttpClient);
  httpMock = TestBed.inject(HttpTestingController);
});

describe("l'estampille du jeton staff", () => {
  it("demande l'audience staff, pas celle que le référentiel avait", async () => {
    const done = firstValueFrom(http.get(`${API}/catalogue/products`));
    const request = await expectOne(httpMock, `${API}/catalogue/products`);

    expect(embed.calls).toEqual(['b2bAdmin']);
    expect(request.request.headers.get('Authorization')).toBe('Bearer jeton-staff');
    request.flush([]);
    await done;
  });

  it("ne l'attache PAS à une requête hors de l'API", async () => {
    const done = firstValueFrom(http.get('https://ailleurs.example/ressource'));
    const request = await expectOne(httpMock, 'https://ailleurs.example/ressource');

    expect(embed.calls).toEqual([]);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
    await done;
  });

  it('ne redemande pas le jeton à chaque appel', async () => {
    const first = firstValueFrom(http.get(`${API}/a`));
    (await expectOne(httpMock, `${API}/a`)).flush([]);
    await first;

    const second = firstValueFrom(http.get(`${API}/b`));
    (await expectOne(httpMock, `${API}/b`)).flush([]);
    await second;

    expect(embed.calls).toEqual(['b2bAdmin']);
  });

  it('oublie le jeton sur un 401, pour que le suivant en redemande un', async () => {
    const refused = firstValueFrom(http.get(`${API}/a`)).catch(() => 'refusé');
    (await expectOne(httpMock, `${API}/a`)).flush(null, { status: 401, statusText: 'nope' });
    expect(await refused).toBe('refusé');

    const retried = firstValueFrom(http.get(`${API}/b`));
    (await expectOne(httpMock, `${API}/b`)).flush([]);
    await retried;

    expect(embed.calls).toEqual(['b2bAdmin', 'b2bAdmin']);
  });

  it("part sans jeton quand le shell n'en donne pas — au backend de trancher", async () => {
    embed.token = null;
    const done = firstValueFrom(http.get(`${API}/a`));
    const request = await expectOne(httpMock, `${API}/a`);

    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush([]);
    await done;
  });
});

/**
 * Attend que la requête atteigne le contrôleur de test. L'intercepteur passe par
 * une promesse (le jeton) : la requête n'est donc PAS émise dans le même tour de
 * boucle que l'appel, et un `expectOne` immédiat ne trouverait rien.
 */
async function expectOne(mock: HttpTestingController, url: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await Promise.resolve();
  }
  return mock.expectOne(url);
}
