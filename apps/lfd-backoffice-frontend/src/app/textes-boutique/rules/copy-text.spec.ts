import { describe, expect, it } from 'vitest';

import { localeView } from '../shop-copy.testing';
import { missingVariables, rowsFor, segmentsOf, upcomingText } from './copy-text';

describe('copy-text', () => {
  it('dit les variables perdues', () => {
    expect(missingVariables('Bonjour {name}', ['name', 'count'])).toEqual(['count']);
    expect(missingVariables('{count} pour {name}', ['name', 'count'])).toEqual([]);
  });

  it('découpe un texte en morceaux et en pastilles', () => {
    expect(segmentsOf('Étape {n} sur {total}')).toEqual([
      { kind: 'text', value: 'Étape ' },
      { kind: 'variable', value: 'n' },
      { kind: 'text', value: ' sur ' },
      { kind: 'variable', value: 'total' },
    ]);
  });

  it('dit ce que Publier servira', () => {
    expect(upcomingText(localeView('Code', { draftState: 'set', draftText: 'Brouillon' }))).toBe(
      'Brouillon',
    );
    expect(
      upcomingText(localeView('Code', { draftState: 'reset', publishedText: 'En ligne' })),
    ).toBe('Code');
    expect(upcomingText(localeView('Code', { publishedText: 'En ligne' }))).toBe('En ligne');
    expect(upcomingText(localeView('Code'))).toBe('Code');
  });

  it('donne au champ la hauteur de son texte : une ligne pour un titre court', () => {
    expect(rowsFor('Bienvenue')).toBe(1);
    expect(rowsFor('Commander.\nRetirer.\nDéguster.')).toBe(3);
    expect(rowsFor('x'.repeat(130))).toBe(3);
  });
});
