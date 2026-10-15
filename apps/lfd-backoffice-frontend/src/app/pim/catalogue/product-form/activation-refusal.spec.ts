import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';

import { activationRefusalOf } from './activation-refusal';

function refused(code: string, message: string): HttpErrorResponse {
  return new HttpErrorResponse({ status: 409, error: { code, message } });
}

describe('activationRefusalOf', () => {
  it('ne lit que le refus d’activation', () => {
    expect(activationRefusalOf(refused('catalogue.product.other', 'x — a ; b'))).toBeNull();
    expect(activationRefusalOf(new Error('réseau'))).toBeNull();
  });

  it('découpe une ligne par déclinaison, sans le point final', () => {
    const refusal = activationRefusalOf(
      refused('catalogue.product.not_activatable', 'Refusée — A-1 : prix ; A-2 : allergènes.'),
    );
    expect(refusal).toEqual({ intro: 'Refusée', lines: ['A-1 : prix', 'A-2 : allergènes'] });
  });

  it('rend le message entier quand il n’a pas la forme attendue', () => {
    // Le message réel du référentiel quand tout est arrêté : un tiret, mais pas de liste.
    const message =
      'Activation refusée : toutes les déclinaisons sont arrêtées — en rouvrir une et la compléter.';
    expect(activationRefusalOf(refused('catalogue.product.not_activatable', message))).toEqual({
      intro: message,
      lines: [],
    });
  });
});
