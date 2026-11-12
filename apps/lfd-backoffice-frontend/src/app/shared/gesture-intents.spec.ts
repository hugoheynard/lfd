import { HttpErrorResponse } from '@angular/common/http';

import { GestureIntents, shownOnce } from './gesture-intents';

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
