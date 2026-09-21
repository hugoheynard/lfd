import { describe, expect, it } from 'vitest';

import { blockersOf, exclusionIndex } from '../../channels/b2b-exclusions';
import { b2bChannelState } from '../products-page/products-page';

const PRODUCT = { sku: 'CHO-002', status: 'published', variants: [{ sku: 'CHO-002-1' }] };

/** Les refus de l'aperçu pour cette fiche, à partir des motifs bruts. */
function blockers(...reasons: readonly string[]) {
  return blockersOf(
    PRODUCT,
    exclusionIndex(reasons.map((reason) => ({ sku: PRODUCT.sku, reason }))),
  );
}

describe('le badge de la colonne « Boutique B2B »', () => {
  it('reste hors canal tant qu’aucune appartenance n’existe', () => {
    expect(b2bChannelState(false, null, [])).toBe('hors_canal');
  });

  /**
   * 🔴 Régression : la colonne ne lisait QUE l'appartenance, alors que la
   * projection décide sur la matrice des contextes de vente. Une fiche dont
   * l'appartenance est ouverte et la matrice fermée — CHO-002 le 2026-09-13 —
   * s'affichait « jamais poussée » en orange, c'est-à-dire « la décision est
   * prise, le catalogue ne l'a pas emportée ». La vérité est l'inverse : rien
   * ne l'emportera jamais tant que sa matrice reste fermée.
   */
  it('dit le refus de la matrice plutôt qu’un envoi en attente', () => {
    expect(b2bChannelState(true, null, blockers('canal_ferme'))).toBe('non_vendue_pro');
  });

  /** Le refus l'emporte même sur une fiche déjà partie : elle sortira au prochain push. */
  it('dit le refus même après un envoi passé', () => {
    expect(b2bChannelState(true, '2026-09-01T08:00:00.000Z', blockers('canal_ferme'))).toBe(
      'non_vendue_pro',
    );
  });

  /**
   * Les autres motifs sont des MANQUES, et la note sous la ligne les porte.
   * Les faire remonter au badge écraserait la seule chose qu'il sache dire.
   */
  it('reste sur l’attente d’envoi quand il ne manque qu’un tarif', () => {
    expect(b2bChannelState(true, null, blockers('variant_sans_prix'))).toBe('jamais_poussee');
  });

  it('passe à « poussée » une fois partie et sans refus', () => {
    expect(b2bChannelState(true, '2026-09-01T08:00:00.000Z', [])).toBe('poussee');
  });

  /**
   * L'aperçu peut échouer (rapport pro absent, canal injoignable) : la liste
   * reste affichée sans lui. Le badge retombe alors sur ce qu'il savait dire
   * avant — il dégrade, il n'invente pas.
   */
  it('retombe sur l’appartenance quand l’aperçu manque', () => {
    expect(b2bChannelState(true, null, [])).toBe('jamais_poussee');
  });
});
