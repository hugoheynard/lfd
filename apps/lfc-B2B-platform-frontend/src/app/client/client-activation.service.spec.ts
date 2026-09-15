import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { ActivationGate } from '@lfd/contracts';
import { of } from 'rxjs';

import { AuthFacade } from '../auth/auth.facade';
import { ClientActivation } from './client-activation.service';
import { TOMMEUSES } from './mon-compte/account.fixture';

const GATE: ActivationGate = {
  canActivate: false,
  blocking: ['vat'],
  checklist: [{ piece: 'vat', blocking: true, done: false }],
};

const ACTIVATION = (r: { url: string }): boolean => r.url.endsWith('/companies/cmp_1/activation');

function boot(): { http: HttpTestingController; activation: ClientActivation } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AuthFacade, useValue: { accessToken$: () => of('jeton') } },
    ],
  });
  return {
    http: TestBed.inject(HttpTestingController),
    activation: TestBed.inject(ClientActivation),
  };
}

/** Le jeton, puis la requête : une microtâche avant que la requête existe. */
const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('le verdict d’activation du client', () => {
  it('lit le verdict de la société suivie, avec le jeton', async () => {
    const { http, activation } = boot();
    activation.follow(TOMMEUSES);
    await settle();

    const request = http.expectOne(ACTIVATION);
    expect(request.request.headers.get('Authorization')).toBe('Bearer jeton');
    request.flush(GATE);
    await settle();

    expect(activation.gate()).toEqual(GATE);
  });

  it('ne relit pas la même vue de société, mais relit une vue relue par `/me`', async () => {
    const { http, activation } = boot();
    activation.follow(TOMMEUSES);
    await settle();
    http.expectOne(ACTIVATION).flush(GATE);

    activation.follow(TOMMEUSES);
    await settle();
    http.expectNone(ACTIVATION);

    activation.follow({ ...TOMMEUSES });
    await settle();
    http.expectOne(ACTIVATION).flush(GATE);
  });

  it('un échec de lecture laisse le verdict à `null` — pas de synthèse, pas de page cassée', async () => {
    const { http, activation } = boot();
    activation.follow(TOMMEUSES);
    await settle();
    http.expectOne(ACTIVATION).flush(GATE);
    await settle();
    expect(activation.gate()).toEqual(GATE);

    const refreshing = activation.refresh('cmp_1');
    await settle();
    http.expectOne(ACTIVATION).flush({}, { status: 500, statusText: 'Server Error' });
    await refreshing;

    expect(activation.gate()).toBeNull();
  });

  it('`refresh` ne lit rien pour une société jamais lue', async () => {
    const { http, activation } = boot();
    await activation.refresh('cmp_1');
    http.verify();
    expect(activation.gate()).toBeNull();
  });
});
