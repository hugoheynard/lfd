import { describe, expect, it } from 'vitest';

import { returnAmount, returnBadge, returnSentence } from '../collection-return-wording';
import { collectionReturn } from './collection-return-fixture';

describe('les mots d’un retour bancaire', () => {
  it('« Prélèvement rejeté le … (motif) » pour un rejet, le genre sinon', () => {
    expect(returnSentence(collectionReturn())).toBe(
      'Prélèvement rejeté le 16 oct. 2026 (Provision insuffisante)',
    );
    expect(returnSentence(collectionReturn({ kind: 'return' }))).toContain(
      'Retour (après règlement)',
    );
  });

  it('les frais à côté du montant, jamais dedans', () => {
    expect(returnAmount(collectionReturn())).toMatch(/123,45.*frais 7,50/u);
    expect(returnAmount(collectionReturn({ feeCents: null }))).not.toContain('frais');
  });

  it('à traiter en alerte, perdu en neutre', () => {
    expect(returnBadge(collectionReturn()).variant).toBe('alert');
    expect(returnBadge(collectionReturn({ resolution: 'written_off' })).label).toBe(
      'Passé en perte',
    );
  });
});
