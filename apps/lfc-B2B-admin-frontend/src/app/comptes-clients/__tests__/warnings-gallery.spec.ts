import { describe, expect, it } from 'vitest';

import type { AdminCompany } from '../admin-company';
import { warningCards } from '../warnings-gallery/warnings-gallery.model';

const NOW = new Date('2026-08-14T09:00:00.000Z');

function company(over: Partial<AdminCompany> = {}): AdminCompany {
  return {
    id: 'cmp_1',
    enseigne: 'Le Comptoir',
    raisonSociale: 'Le Comptoir SAS',
    warnings: [],
    ...over,
  } as AdminCompany;
}

describe('la galerie d’avertissements', () => {
  it('ne montre rien quand rien n’appelle un geste', () => {
    expect(warningCards([company()], NOW)).toEqual([]);
  });

  it('fait UNE carte par motif, pas une carte par société', () => {
    // Deux manques sur la même société font deux cartes : la répétition du nom
    // dans la rangée EST le signal, pas un défaut.
    const cards = warningCards(
      [
        company({
          warnings: [
            { kind: 'mandat_absent', since: null },
            { kind: 'kbis_a_verifier', since: '2026-08-12T09:00:00.000Z' },
          ],
        }),
      ],
      NOW,
    );

    expect(cards).toHaveLength(2);
    expect(cards.map((card) => card.key)).toEqual(['cmp_1:mandat_absent', 'cmp_1:kbis_a_verifier']);
  });

  it('garde l’ordre du serveur, sans le retrier', () => {
    // Deux ordres finiraient par diverger — la même erreur que la porte
    // d'activation écrite deux fois.
    const cards = warningCards(
      [
        company({
          id: 'cmp_a',
          warnings: [{ kind: 'kbis_a_verifier', since: '2026-08-01T09:00:00.000Z' }],
        }),
        company({
          id: 'cmp_b',
          warnings: [{ kind: 'mandat_absent', since: null }],
        }),
      ],
      NOW,
    );

    expect(cards.map((card) => card.companyId)).toEqual(['cmp_a', 'cmp_b']);
  });

  it('dit l’âge, parce que c’est lui qui fait monter l’urgence', () => {
    const cards = warningCards(
      [company({ warnings: [{ kind: 'kbis_a_verifier', since: '2026-08-02T09:00:00.000Z' }] })],
      NOW,
    );

    expect(cards[0]?.age).toBe('depuis 12 jours');
  });

  it('n’invente PAS d’âge quand le fait n’a pas de date', () => {
    // Un mandat qui n'existe pas n'a pas commencé un jour donné : « depuis
    // 0 jour » serait un compteur inventé.
    const cards = warningCards(
      [company({ warnings: [{ kind: 'mandat_absent', since: null }] })],
      NOW,
    );

    expect(cards[0]?.age).toBe('');
  });

  it('nomme la société comme le commercial la reconnaît', () => {
    // L'enseigne d'abord ; la raison sociale seulement à défaut.
    const sansEnseigne = warningCards(
      [company({ enseigne: '  ', warnings: [{ kind: 'mandat_absent', since: null }] })],
      NOW,
    );

    expect(sansEnseigne[0]?.companyName).toBe('Le Comptoir SAS');
  });
});
