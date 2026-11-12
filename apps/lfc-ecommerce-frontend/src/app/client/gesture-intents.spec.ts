import { HttpHeaders } from '@angular/common/http';

import { GestureIntents, INTENT_KEY_HEADER, intentOptions, withIntent } from './gesture-intents';

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
