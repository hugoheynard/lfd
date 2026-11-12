import { HttpClient, HttpHeaders, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import {
  GestureIntents,
  INTENT_KEY_HEADER,
  intentOptions,
  refusedIntentKeyInterceptor,
  withIntent,
} from './gesture-intents';

describe('GestureIntents', () => {
  it('renvoie la même clé pour un sujet tant que le geste n’a pas abouti', () => {
    const intents = new GestureIntents();

    const first = intents.keyFor('contact');

    expect(intents.keyFor('contact')).toBe(first);
    expect(intents.keyFor('autre')).not.toBe(first);
  });

  it('fabrique une clé neuve une fois le geste abouti', () => {
    const intents = new GestureIntents();
    const first = intents.keyFor('contact');

    intents.done('contact');

    expect(intents.keyFor('contact')).not.toBe(first);
  });

  it('pose la clé dans l’en-tête que l’API lit, sans perdre les en-têtes déjà là', () => {
    const headers = withIntent(new HttpHeaders({ Authorization: 'Bearer t' }), 'k-1');

    expect(headers.get(INTENT_KEY_HEADER)).toBe('k-1');
    expect(headers.get('Authorization')).toBe('Bearer t');
    expect(intentOptions('k-2').headers.get(INTENT_KEY_HEADER)).toBe('k-2');
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
