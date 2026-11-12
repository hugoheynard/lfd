import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import {
  GestureIntents,
  intentOptions,
  refusedIntentKeyInterceptor,
  shownOnce,
} from './gesture-intents';

const refusal = (code: string): HttpErrorResponse =>
  new HttpErrorResponse({ status: 409, error: { code } });

describe('shownOnce — un secret montré une fois', () => {
  it('oublie la clé au succès : le clic suivant est un geste neuf', async () => {
    const intents = new GestureIntents();
    const keys: string[] = [];
    await shownOnce(intents, 'u1', (key) => Promise.resolve(keys.push(key)));
    await shownOnce(intents, 'u1', (key) => Promise.resolve(keys.push(key)));
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('garde la clé sur une panne réseau : le réessai rejoue la même intention', async () => {
    const intents = new GestureIntents();
    const keys: string[] = [];
    await expect(
      shownOnce(intents, 'u1', (key) => {
        keys.push(key);
        return Promise.reject(new HttpErrorResponse({ status: 0 }));
      }),
    ).rejects.toBeInstanceOf(HttpErrorResponse);
    await shownOnce(intents, 'u1', (key) => Promise.resolve(keys.push(key)));
    expect(keys[0]).toBe(keys[1]);
  });

  /** Régression : après « déjà émis », la clé restait et chaque nouveau clic retombait sur le même refus. */
  it('oublie la clé sur « déjà émis », la garde sur « encore en vol »', async () => {
    const intents = new GestureIntents();
    const first = intents.keyFor('u1');
    await expect(
      shownOnce(intents, 'u1', () => Promise.reject(refusal('intent.in_flight'))),
    ).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(intents.keyFor('u1')).toBe(first);
    await expect(
      shownOnce(intents, 'u1', () =>
        Promise.reject(refusal('account.password_link.already_issued')),
      ),
    ).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(intents.keyFor('u1')).not.toBe(first);
  });
});

describe('refusedIntentKeyInterceptor — une clé servie sur un autre contenu', () => {
  const send = async (
    intents: GestureIntents,
    subject: string,
    flush: (request: TestRequest) => void,
  ): Promise<string> => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([refusedIntentKeyInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    const http = TestBed.inject(HttpClient);
    const backend = TestBed.inject(HttpTestingController);
    const key = intents.keyFor(subject);
    const sent = firstValueFrom(http.post('/api/x', {}, intentOptions(key)));
    flush(backend.expectOne('/api/x'));
    await sent.catch(() => undefined);
    TestBed.resetTestingModule();
    return key;
  };

  const refuse = (code: string) => (request: TestRequest) =>
    request.flush({ code }, { status: 409, statusText: 'Conflict' });

  /**
   * Régression : après un 409 « déjà enregistré avec d'autres valeurs », la
   * clé restait, et chaque nouvel essai du formulaire corrigé retombait sur le
   * même refus.
   */
  it('oublie la clé refusée comme déjà servie : le nouvel essai porte une clé neuve', async () => {
    const intents = new GestureIntents();
    const refused = await send(intents, 'virement', refuse('intent.key_reused'));
    expect(intents.keyFor('virement')).not.toBe(refused);
  });

  it('garde la clé sur « encore en vol » et sur une panne : le réessai rejoue la même intention', async () => {
    const intents = new GestureIntents();
    const inFlight = await send(intents, 'virement', refuse('intent.in_flight'));
    expect(intents.keyFor('virement')).toBe(inFlight);
    const failed = await send(intents, 'virement', (request) =>
      request.flush(null, { status: 503, statusText: 'Unavailable' }),
    );
    expect(failed).toBe(inFlight);
    expect(intents.keyFor('virement')).toBe(inFlight);
  });
});
