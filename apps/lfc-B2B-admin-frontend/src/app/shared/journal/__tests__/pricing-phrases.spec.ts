import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/**
 * **Les phrases de la tarification** (lot D du plan des phrases du journal) :
 * l'auteur, le verbe et le sujet par le moteur, la phrase figée à l'acte citée
 * telle quelle, et la forme d'avant le lot B, sans libellé.
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
  'Geste « Été » · −10 % · famille « Tartes », client « Café des Halles » · du 01/09/2026 au 30/09/2026';

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

  it('cite la phrase figée derrière l’auteur, le verbe et la règle', () => {
    expect(renderFact(posed).sentence).toBe(
      `Colette Martin a posé la règle de prix « Été » : ${RULE_SUMMARY}`,
    );
    expect(renderFact(posed).namesActor).toBe(true);
  });

  it('laisse le motif au détail, et ne répète pas le client que la phrase figée nomme', () => {
    expect(row(posed, 'Motif')).toBe('Fidélité');
    expect(row(posed, 'Client visé')).toBeUndefined();
  });

  it('dit un renommage sous le nouveau nom, l’ancien restant dans la phrase figée', () => {
    const renamed = fact({
      type: 'price_rule.renamed',
      payload: { subjectLabel: 'Automne', summary: RULE_SUMMARY, reason: null },
    });

    expect(renderFact(renamed).sentence).toBe(
      `Colette Martin a renommé une règle de prix en « Automne » : ${RULE_SUMMARY}`,
    );
  });

  it('se lit sur une ligne d’avant le lot B, sans libellé', () => {
    const old = fact({
      type: 'price_rule.paused',
      payload: { summary: RULE_SUMMARY, reason: 'Rupture' },
    });

    expect(renderFact(old).sentence).toBe(
      `Colette Martin a suspendu une règle de prix : ${RULE_SUMMARY}`,
    );
    expect(row(old, 'Motif')).toBe('Rupture');
  });
});

describe('les actes sur une limite de prix', () => {
  it('donne son article à la portée que le domaine a nommée', () => {
    expect(
      renderFact(
        fact({
          type: 'price_floor.posed',
          payload: { subjectLabel: 'famille « Tartes »', summary: 'mur à 2,00 €', reason: null },
        }),
      ).sentence,
    ).toBe('Colette Martin a posé la limite de prix sur la famille « Tartes » : mur à 2,00 €');
  });

  it('dit « tout le catalogue » sans article de plus', () => {
    expect(
      renderFact(
        fact({
          type: 'price_floor.archived',
          payload: { subjectLabel: 'tout le catalogue', summary: 'mur à 1,00 €', reason: null },
        }),
      ).sentence,
    ).toBe('Colette Martin a archivé la limite de prix sur tout le catalogue : mur à 1,00 €');
  });
});

describe('les actes sur un barème de volume', () => {
  it('cite le barème et ses paliers figés', () => {
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
    ).toBe(
      'Colette Martin a repris le barème de volume « Gros volumes » : Barème « Gros volumes » · 50+ à −5 %',
    );
  });
});

describe('les actes sur une mercuriale', () => {
  const summary = 'Mercuriale « Été » — 12 article(s), du 2026-09-01 au sans terme';

  it('dit la pose', () => {
    expect(
      renderFact(
        fact({
          type: 'company_mercuriale.posed',
          payload: { subjectLabel: 'Été', summary, reason: 'Posée par le gabarit « Club »' },
        }),
      ).sentence,
    ).toBe(`Colette Martin a posé la mercuriale « Été » : ${summary}`);
  });

  it('dit un renommage sous le nouveau nom', () => {
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
    ).toBe(`Colette Martin a renommé une mercuriale en « Automne » : ${summary}`);
  });

  it('se lit sur une ligne d’avant le lot B, sans libellé', () => {
    expect(
      renderFact(fact({ type: 'company_mercuriale.archived', payload: { summary, reason: null } }))
        .sentence,
    ).toBe(`Colette Martin a archivé une mercuriale : ${summary}`);
  });
});
