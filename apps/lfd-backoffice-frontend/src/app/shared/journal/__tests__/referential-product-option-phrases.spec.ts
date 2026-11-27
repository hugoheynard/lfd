import { isJournalFactType, journalPayloadShapes } from '@lfd/contracts/journal-facts';
import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput, type RenderedFact } from '../render-fact';

/**
 * **Les phrases des options de commande** — le groupe et son activation sur
 * une fiche (`plan-options-de-commande.md`, § 3.1). Chaque charge est d'abord
 * confrontée au catalogue des faits.
 */

function on(subjectType: string, type: string, payload: Record<string, unknown>): FactInput {
  return {
    type,
    payload,
    subjectType,
    subjectId: `${subjectType}_1`,
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

function render(input: FactInput): RenderedFact {
  const type = input.type;
  expect(isJournalFactType(type)).toBe(true);
  const shapes = isJournalFactType(type) ? journalPayloadShapes(type) : [];
  expect(shapes.some((shape) => shape.safeParse(input.payload).success)).toBe(true);
  return renderFact(input);
}

const GROUP = { subjectLabel: 'Tranchage', name: 'Tranchage' };

describe('le groupe d’options', () => {
  it('dit la création avec ses choix, sans rien laisser au détail', () => {
    const fact = on('option_group', 'option_group.created', {
      ...GROUP,
      choices: ['Tranché', 'Tranché fin'],
    });
    expect(render(fact).sentence).toBe(
      'Colette Martin a créé le groupe d’options « Tranchage » (Tranché, Tranché fin)',
    );
    expect(render(fact).detail).toEqual([]);
  });

  it('dit la révision par l’état d’après', () => {
    const fact = on('option_group', 'option_group.revised', { ...GROUP, choices: ['Tranché'] });
    expect(render(fact).sentence).toBe(
      'Colette Martin a modifié le groupe d’options « Tranchage » (Tranché)',
    );
  });

  it('dit l’archive et la restauration', () => {
    expect(render(on('option_group', 'option_group.archived', GROUP)).sentence).toBe(
      'Colette Martin a archivé le groupe d’options « Tranchage »',
    );
    expect(render(on('option_group', 'option_group.restored', GROUP)).sentence).toBe(
      'Colette Martin a restauré le groupe d’options « Tranchage »',
    );
  });
});

describe('l’activation sur une fiche', () => {
  const PRODUCT = { subjectLabel: 'Pain de campagne', name: 'Tranchage' };

  it('dit « toutes ses déclinaisons » quand la charge porte `null`', () => {
    const fact = on('product', 'product.option_group_activated', { ...PRODUCT, variants: null });
    expect(render(fact).sentence).toBe(
      'Colette Martin a activé le groupe d’options « Tranchage » sur « Pain de campagne » pour toutes ses déclinaisons',
    );
    expect(render(fact).detail).toEqual([]);
  });

  it('nomme les déclinaisons d’une liste', () => {
    const fact = on('product', 'product.option_group_activated', {
      ...PRODUCT,
      variants: ['500 g', 'Au poids'],
    });
    expect(render(fact).sentence).toBe(
      'Colette Martin a activé le groupe d’options « Tranchage » sur « Pain de campagne » pour « 500 g », « Au poids »',
    );
  });

  it('dit le retrait', () => {
    const fact = on('product', 'product.option_group_deactivated', PRODUCT);
    expect(render(fact).sentence).toBe(
      'Colette Martin a retiré le groupe d’options « Tranchage » de « Pain de campagne »',
    );
  });
});
