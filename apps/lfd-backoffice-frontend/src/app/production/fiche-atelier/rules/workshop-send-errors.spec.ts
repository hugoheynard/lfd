import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';

import { GestureKept, isOffline, reasonOf } from './workshop-send-errors';

const NO_ANSWER =
  'Le serveur n’a pas répondu — réessayez : la même fournée ne comptera pas deux fois.';

describe('isOffline', () => {
  it('reconnaît une réponse HTTP de statut 0', () => {
    expect(isOffline(new HttpErrorResponse({ status: 0 }))).toBe(true);
  });

  it.each([
    ['une réponse 409', new HttpErrorResponse({ status: 409 })],
    ['une erreur ordinaire', new Error('boum')],
    ['une valeur nue', 'status 0'],
    ['null', null],
  ])('refuse %s', (_cas, error) => {
    expect(isOffline(error)).toBe(false);
  });
});

describe('GestureKept', () => {
  it('porte ce qu’il faut dire et se nomme', () => {
    const kept = new GestureKept('gardé');

    expect(kept).toBeInstanceOf(Error);
    expect(kept.said).toBe('gardé');
    expect(kept.name).toBe('GestureKept');
  });
});

describe('reasonOf', () => {
  it('rend le message d’un geste gardé tel quel', () => {
    expect(reasonOf(new GestureKept('« Fait » est gardé'))).toBe('« Fait » est gardé');
  });

  it('dit qu’on ne sait pas si le serveur a écrit quand il n’a pas répondu', () => {
    expect(reasonOf(new HttpErrorResponse({ status: 0 }))).toBe(NO_ANSWER);
  });

  it('rend le message de l’enveloppe d’erreur du serveur', () => {
    expect(
      reasonOf(new HttpErrorResponse({ status: 409, error: { message: 'Fournée déjà annulée' } })),
    ).toBe('Fournée déjà annulée');
  });

  it('tombe sur le repli neutre pour une erreur inconnue', () => {
    expect(reasonOf(new Error('boum'))).toBe('Le serveur n’a pas enregistré ce geste.');
  });
});
