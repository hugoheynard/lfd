import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';

import { serverMessageOf } from '../server-message';

describe('ce que le serveur a dit d’un geste refusé', () => {
  it('rend le message du serveur, écrit pour le personnel', () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: { code: 'production.day_not_closed', message: 'Le plan du 14 n’est pas arrêté.' },
    });

    expect(serverMessageOf(error)).toBe('Le plan du 14 n’est pas arrêté.');
  });

  it('dit que le serveur n’a pas répondu, plutôt qu’un refus qu’il n’a pas prononcé', () => {
    expect(serverMessageOf(new HttpErrorResponse({ status: 0 }))).toBe(
      'Le serveur n’a pas répondu — rien n’a été enregistré.',
    );
  });

  it.each([
    ['sans corps', new HttpErrorResponse({ status: 500 })],
    ['un corps texte', new HttpErrorResponse({ status: 409, error: 'Conflict' })],
    ['un message vide', new HttpErrorResponse({ status: 409, error: { message: '  ' } })],
    ['un tableau de validation', new HttpErrorResponse({ status: 400, error: { message: ['x'] } })],
    ['une erreur qui n’est pas HTTP', new Error('panne')],
  ])('se replie sur un message neutre pour %s', (_case, error) => {
    expect(serverMessageOf(error)).toBe('Le serveur n’a pas enregistré ce geste.');
  });
});
