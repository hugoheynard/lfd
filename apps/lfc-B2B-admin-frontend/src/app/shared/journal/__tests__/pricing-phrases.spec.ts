import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/**
 * **Les phrases de la tarification** (lot D du plan des phrases du journal) :
 * l'auteur, le verbe et le sujet par le moteur, la phrase figée à l'acte citée
 * sans répéter le nom qu'elle porte en tête, le motif en fin de phrase, et la
 * forme d'avant le lot B, sans libellé.
 */

function fact(overrides: Partial<FactInput> & Pick<FactInput, 'type'>): FactInput {
  return {
    payload: {},
    subjectType: overrides.type.slice(0, overrides.type.lastIndexOf('.')),
    subjectId: 'sujet_1',
    actorName: 'Colette Martin',
    actorType: 'staff',
    ...overrides,
  };
}

function row(input: FactInput, label: string): string | undefined {
  return renderFact(input).detail.find((candidate) => candidate.label === label)?.value;
}

const RULE_SUMMARY =
  'Geste « Été » · −10 % · famille « Tartes », client « Café des Halles » · du 1er septembre 2026 au 30 septembre 2026';
/** Ce que la phrase figée dit une fois son nom tombé : l'étage reste, il apprend quelque chose. */
const RULE_TAIL =
  'Geste · −10 % · famille « Tartes », client « Café des Halles » · du 1er septembre 2026 au 30 septembre 2026';

describe('les actes sur une règle de prix', () => {
  const posed = fact({
    type: 'price_rule.posed',
    payload: {
      subjectLabel: 'Été',
      summary: RULE_SUMMARY,
      reason: 'Fidélité',
      audience: { id: 'co_1', name: 'Café des Halles' },
    },
  });

  it('cite la phrase figée sans y répéter le nom de la règle, et dit le motif', () => {
    expect(renderFact(posed).sentence).toBe(
      `Colette Martin a posé la règle de prix « Été » : ${RULE_TAIL} — motif : Fidélité`,
    );
    expect(renderFact(posed).namesActor).toBe(true);
  });

  it('ne répète au détail ni le motif, ni le client que la phrase figée nomme', () => {
    expect(row(posed, 'Motif')).toBeUndefined();
    expect(row(posed, 'Client visé')).toBeUndefined();
  });

  it('dit un renommage de l’ancien nom, que la phrase figée porte, au nouveau', () => {
    const renamed = fact({
      type: 'price_rule.renamed',
      payload: { subjectLabel: 'Automne', summary: RULE_SUMMARY, reason: null },
    });

    expect(renderFact(renamed).sentence).toBe(
      `Colette Martin a renommé la règle de prix « Été » en « Automne » : ${RULE_TAIL}`,
    );
  });

  it('se lit sur une ligne d’avant le lot B, sans libellé : la phrase figée entière', () => {
    const old = fact({
      type: 'price_rule.paused',
      payload: { summary: RULE_SUMMARY, reason: 'Rupture' },
    });

    expect(renderFact(old).sentence).toBe(
      `Colette Martin a suspendu une règle de prix : ${RULE_SUMMARY} — motif : Rupture`,
    );
  });

  it('cite entière une phrase figée qui n’ouvre pas sur le nom', () => {
    const other = fact({
      type: 'price_rule.archived',
      payload: { subjectLabel: 'Été', summary: '−10 % sur tout le catalogue', reason: null },
    });

    expect(renderFact(other).sentence).toBe(
      'Colette Martin a archivé la règle de prix « Été » : −10 % sur tout le catalogue',
    );
  });
});

describe('les actes sur une limite de prix', () => {
  it('dit la portée telle que le domaine l’a nommée, sans lui deviner d’article', () => {
    expect(
      renderFact(
        fact({
          type: 'price_floor.posed',
          payload: { subjectLabel: 'famille « Tartes »', summary: 'mur à 2,00 €', reason: null },
        }),
      ).sentence,
    ).toBe('Colette Martin a posé la limite de prix (portée : famille « Tartes ») : mur à 2,00 €');
  });

  it('dit « tout le catalogue » de la même façon, et le motif', () => {
    expect(
      renderFact(
        fact({
          type: 'price_floor.archived',
          payload: { subjectLabel: 'tout le catalogue', summary: 'mur à 1,00 €', reason: 'Fin' },
        }),
      ).sentence,
    ).toBe(
      'Colette Martin a archivé la limite de prix (portée : tout le catalogue) : mur à 1,00 € — motif : Fin',
    );
  });
});

describe('les actes sur un barème de volume', () => {
  it('cite les paliers figés sans répéter « Barème » ni son nom', () => {
    expect(
      renderFact(
        fact({
          type: 'volume_ladder.resumed',
          payload: {
            subjectLabel: 'Gros volumes',
            summary: 'Barème « Gros volumes » · 50+ à −5 %',
            reason: null,
          },
        }),
      ).sentence,
    ).toBe('Colette Martin a repris le barème de volume « Gros volumes » : 50+ à −5 %');
  });
});

describe('les actes sur une mercuriale', () => {
  const summary = 'Mercuriale « Été » — 12 articles, du 1er septembre 2026, sans date de fin';
  const tail = '12 articles, du 1er septembre 2026, sans date de fin';

  /**
   * Régression : la provenance qu'`apply-price-template` écrit dans `reason`
   * se lisait « motif : Posée par le gabarit « Club » » — un motif que
   * personne n'a donné.
   */
  it('dit le gabarit qui l’a posée comme une provenance, pas comme un motif', () => {
    const posed = fact({
      type: 'company_mercuriale.posed',
      payload: { subjectLabel: 'Été', summary, reason: 'Posée par le gabarit « Club »' },
    });

    expect(renderFact(posed).sentence).toBe(
      `Colette Martin a posé la mercuriale « Été » par le gabarit « Club » : ${tail}`,
    );
    expect(row(posed, 'Motif')).toBeUndefined();
  });

  it('ne répète pas « posée par gabarit » de la phrase figée, qui le dit sans le nom', () => {
    expect(
      renderFact(
        fact({
          type: 'company_mercuriale.posed',
          payload: {
            subjectLabel: 'Club',
            summary: 'Mercuriale « Club » — 12 articles, posée par gabarit',
            reason: 'Posée par le gabarit « Club »',
          },
        }),
      ).sentence,
    ).toBe('Colette Martin a posé la mercuriale « Club » par le gabarit « Club » : 12 articles');
  });

  it('dit comme un motif ce qui ressemble à un gabarit sans en avoir la forme exacte', () => {
    expect(
      renderFact(
        fact({
          type: 'company_mercuriale.posed',
          payload: { subjectLabel: 'Été', summary, reason: 'Posée par le gabarit « Club », revue' },
        }),
      ).sentence,
    ).toBe(
      `Colette Martin a posé la mercuriale « Été » : ${tail} — motif : Posée par le gabarit « Club », revue`,
    );
  });

  it('tait le « motif » que le serveur écrit à la pose : il ne dit que la phrase', () => {
    const posed = fact({
      type: 'company_mercuriale.posed',
      payload: {
        subjectLabel: 'Été',
        summary,
        reason: 'Mercuriale « Été » posée sur la fiche du compte',
      },
    });

    expect(renderFact(posed).sentence).toBe(
      `Colette Martin a posé la mercuriale « Été » : ${tail}`,
    );
    expect(row(posed, 'Motif')).toBeUndefined();
  });

  it('dit un renommage de l’ancien nom au nouveau, sans son « motif » serveur', () => {
    expect(
      renderFact(
        fact({
          type: 'company_mercuriale.renamed',
          payload: {
            subjectLabel: 'Automne',
            summary,
            reason: 'Mercuriale « Été » renommée « Automne »',
          },
        }),
      ).sentence,
    ).toBe(`Colette Martin a renommé la mercuriale « Été » en « Automne » : ${tail}`);
  });

  it('se lit sur une ligne d’avant le lot B, sans libellé', () => {
    expect(
      renderFact(fact({ type: 'company_mercuriale.archived', payload: { summary, reason: null } }))
        .sentence,
    ).toBe(`Colette Martin a archivé une mercuriale : ${summary}`);
  });
});

describe('les engagements de volume', () => {
  it('dit la signature avec le client et la quantité promise', () => {
    expect(
      renderFact(
        fact({
          type: 'volume_commitment.signed',
          payload: {
            subjectLabel: 'Café des Halles',
            company: { id: 'co_1', name: 'Café des Halles' },
            scope: 'global',
            scopeId: null,
            promisedQuantity: 200,
            validFrom: '2026-09-01T00:00:00.000Z',
            validTo: '2026-12-31T00:00:00.000Z',
          },
        }),
      ).sentence,
    ).toBe(
      'Colette Martin a signé un engagement de volume avec le client « Café des Halles » (quantité promise : 200)',
    );
  });

  it('dit la clôture et son motif, et se lit sur la forme d’avant le lot B', () => {
    expect(
      renderFact(
        fact({
          type: 'volume_commitment.closed',
          payload: { company: { id: 'co_1', name: 'Café des Halles' }, reason: 'Fin de saison' },
        }),
      ).sentence,
    ).toBe(
      'Colette Martin a clos l’engagement de volume du client « Café des Halles » — motif : Fin de saison',
    );
    expect(
      renderFact(fact({ type: 'volume_commitment.closed', payload: { reason: null } })).sentence,
    ).toBe('Colette Martin a clos l’engagement de volume d’un client');
  });
});

describe('l’étage d’une règle, en donnée (forme du 2026-09-19)', () => {
  const current = (type: FactInput['type'], payload: Record<string, unknown>): FactInput =>
    fact({
      type,
      payload: {
        subjectLabel: 'Été',
        summary: RULE_SUMMARY,
        reason: 'Fidélité',
        audience: { id: 'co_1', name: 'Café des Halles' },
        stage: 'geste',
        ...payload,
      },
    });
  /** La phrase figée une fois son nom ET son étage dits. */
  const REST =
    '−10 % · famille « Tartes », client « Café des Halles » · du 1er septembre 2026 au 30 septembre 2026';

  it('nomme l’étage derrière la règle, et ne le répète pas en tête de la phrase figée', () => {
    const posed = current('price_rule.posed', {});

    expect(renderFact(posed).sentence).toBe(
      `Colette Martin a posé la règle de prix « Été » (geste) : ${REST} — motif : Fidélité`,
    );
    expect(row(posed, 'Étage')).toBeUndefined();
    expect(renderFact(posed).detail).toEqual([]);
  });

  it('dit l’étage d’un renommage derrière le nouveau nom', () => {
    expect(
      renderFact(current('price_rule.renamed', { subjectLabel: 'Automne', reason: null })).sentence,
    ).toBe(`Colette Martin a renommé la règle de prix « Été » en « Automne » (geste) : ${REST}`);
  });

  it('dit chaque étage par le mot du panneau tarifaire', () => {
    expect(
      renderFact(
        current('price_rule.archived', {
          stage: 'promotion',
          summary: 'Promotion « Été » · −10 %',
          reason: null,
        }),
      ).sentence,
    ).toBe('Colette Martin a archivé la règle de prix « Été » (promotion) : −10 %');
  });

  it('ne dit pas l’étage deux fois quand la phrase figée, citée entière, l’ouvre', () => {
    expect(
      renderFact(current('price_rule.paused', { summary: 'Geste « Autre » · −10 %', reason: null }))
        .sentence,
    ).toBe('Colette Martin a suspendu la règle de prix « Été » : Geste « Autre » · −10 %');
  });

  it('garde la phrase d’aujourd’hui sur une ligne qui ne porte pas l’étage', () => {
    const lotB = fact({
      type: 'price_rule.posed',
      payload: { subjectLabel: 'Été', summary: RULE_SUMMARY, reason: null },
    });

    expect(renderFact(lotB).sentence).toBe(
      `Colette Martin a posé la règle de prix « Été » : ${RULE_TAIL}`,
    );
  });
});
