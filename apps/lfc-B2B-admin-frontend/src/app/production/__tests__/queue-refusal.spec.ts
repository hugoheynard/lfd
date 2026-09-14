import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';

import { refusalOf } from '../queue-refusal';

function http(status: number, error: unknown = null): HttpErrorResponse {
  return new HttpErrorResponse({ status, error });
}

describe('le tri des échecs d’une file', () => {
  it.each([
    [0, 'pas de réponse — le sous-sol'],
    [401, 'session expirée'],
    [408, 'délai dépassé'],
    [425, 'trop tôt'],
    [429, 'trop de requêtes'],
    [500, 'serveur tombé'],
    [503, 'serveur indisponible'],
  ])('garde le geste sur un %i (%s)', (status) => {
    expect(refusalOf(http(status))).toBeNull();
  });

  it.each([400, 403, 404, 409, 422])('écarte le geste sur un %i', (status) => {
    expect(refusalOf(http(status, { message: 'Refusé.' }))).toEqual({
      status,
      message: 'Refusé.',
    });
  });

  /**
   * 🔴 Écarter est le seul choix irréversible de la file. Sur une erreur qu'on
   * ne sait pas lire, se tromper en gardant coûte un compteur ; se tromper en
   * jetant coûte une coche perdue.
   */
  it('🔴 garde le geste sur une erreur qui n’est pas une réponse HTTP', () => {
    expect(refusalOf(new Error('réseau'))).toBeNull();
    expect(refusalOf({ status: 409 })).toBeNull();
    expect(refusalOf(undefined)).toBeNull();
  });

  it('rend le message du serveur, écrit pour le personnel', () => {
    const refusal = refusalOf(
      http(409, { code: 'production.day_not_closed', message: 'Le plan du 14 n’est pas arrêté.' }),
    );
    expect(refusal?.message).toBe('Le plan du 14 n’est pas arrêté.');
  });

  it.each([
    ['sans corps', null],
    ['un corps texte', 'Conflict'],
    ['un message vide', { message: '   ' }],
    ['un tableau de validation', { message: ['initials must be a string'] }],
  ])('se replie sur un message neutre pour %s', (_case, body) => {
    expect(refusalOf(http(409, body))?.message).toBe('Le serveur a refusé ce geste.');
  });
});
