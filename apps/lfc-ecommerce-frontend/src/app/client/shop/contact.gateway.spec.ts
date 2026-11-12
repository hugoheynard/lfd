import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { ContactMessagePayload } from '@lfd/contracts';
import { of } from 'rxjs';

import { AuthFacade } from '../../auth/auth.facade';
import { INTENT_KEY_HEADER } from '../gesture-intents';
import { ContactGateway } from './contact.gateway';

const PAYLOAD: ContactMessagePayload = {
  reasonId: 'r_1',
  name: 'Jean Martin',
  email: 'jean@exemple.fr',
  phone: '',
  message: 'Bonjour.',
  lfd_trap: '',
};

const PUBLIC_URL = /\/contact-messages$/u;

describe('ContactGateway — un visiteur écrit', () => {
  let gateway: ContactGateway;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthFacade,
          useValue: { isAuthenticated: () => false, accessToken$: () => of('') },
        },
      ],
    });
    gateway = TestBed.inject(ContactGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  /** Régression : la route publique partait sans clé ; un double envoi déposait deux demandes. */
  it('garde la même clé pour un réessai après échec, en prend une neuve après un succès', async () => {
    const first = gateway.send(PAYLOAD);
    const failed = http.expectOne((r) => PUBLIC_URL.test(r.url) && !r.url.includes('/me/'));
    const key = failed.request.headers.get(INTENT_KEY_HEADER);
    expect(key).toMatch(/^[0-9a-f-]{36}$/u);
    failed.flush(null, { status: 503, statusText: 'Service Unavailable' });
    await first;

    const retry = gateway.send(PAYLOAD);
    const retried = http.expectOne((r) => PUBLIC_URL.test(r.url));
    expect(retried.request.headers.get(INTENT_KEY_HEADER)).toBe(key);
    retried.flush(null, { status: 204, statusText: 'No Content' });
    expect(await retry).toBeNull();

    const next = gateway.send(PAYLOAD);
    const fresh = http.expectOne((r) => PUBLIC_URL.test(r.url));
    expect(fresh.request.headers.get(INTENT_KEY_HEADER)).not.toBe(key);
    fresh.flush(null, { status: 204, statusText: 'No Content' });
    await next;
  });
});
