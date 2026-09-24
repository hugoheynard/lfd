import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';

import {
  AUDIENCE_OPTIONS,
  badgeLabel,
  badgeOf,
  localizedOf,
  refusalOf,
  sameLocalized,
} from '../operation-format';

const refused = (code: string, message: string): HttpErrorResponse =>
  new HttpErrorResponse({ status: 400, error: { code, message } });

describe('badgeOf', () => {
  it('rend l’état du serveur tel quel', () => {
    expect(badgeLabel(badgeOf({ state: 'open', archivedAt: null }))).toBe('Ouverte');
  });

  /** Une opération archivée garde un état calculé ; le staff doit lire « Archivée ». */
  it('l’archivage passe avant l’état calculé', () => {
    expect(badgeOf({ state: 'open', archivedAt: '2026-09-24T10:00:00.000Z' })).toBe('archived');
  });
});

describe('localizedOf', () => {
  it('omet une langue vide plutôt que de l’envoyer vide', () => {
    expect(localizedOf({ fr: ' Noël ', en: '', it: 'Natale' })).toEqual({
      fr: 'Noël',
      it: 'Natale',
    });
  });

  it('sans français, il n’y a rien à envoyer', () => {
    expect(localizedOf({ fr: '  ', en: 'Christmas', it: '' })).toBeNull();
  });
});

describe('sameLocalized', () => {
  it('ignore l’ordre des clés', () => {
    expect(sameLocalized({ fr: 'a', en: 'b' }, { en: 'b', fr: 'a' })).toBe(true);
    expect(sameLocalized({ fr: 'a' }, null)).toBe(false);
  });
});

describe('refusalOf', () => {
  it('dit une clé prise en nommant le geste de sortie', () => {
    expect(refusalOf(refused('pim.operation.key_taken', 'x'), 'repli')).toContain(
      'choisissez-en une autre',
    );
  });

  it('garde le message du serveur pour l’ordre des dates, qui nomme les dates en cause', () => {
    const message = "L'annonce (01/12/2026 à 00:00) tombe après l'ouverture…";
    expect(refusalOf(refused('pim.operation.announce_after_order', message), 'repli')).toBe(
      message,
    );
  });

  it('retombe sur le repli sans enveloppe', () => {
    expect(refusalOf(new Error('boom'), 'repli')).toBe('repli');
  });
});

describe('AUDIENCE_OPTIONS', () => {
  it('propose les trois clientèles', () => {
    expect(AUDIENCE_OPTIONS.map((option) => option.value)).toEqual(['both', 'pro', 'public']);
  });
});
