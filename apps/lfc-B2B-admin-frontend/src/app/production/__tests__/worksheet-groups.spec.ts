import type { CatalogItemView, WorkshopLine } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { UNSHELVED_KEY, worksheetGroups } from '../worksheet-groups';

function line(sku: string, productName: string, quantity: number, done = false): WorkshopLine {
  return {
    sku,
    productName,
    quantity,
    containerLabel: null,
    done,
    initials: done ? 'MJ' : null,
    doneAt: done ? '2026-09-13T04:30:00.000Z' : null,
  };
}

function item(sku: string, category: CatalogItemView['category']): CatalogItemView {
  return { sku, name: sku, unitPriceMillicents: 100, vatRate: 5.5, category };
}

const CATALOGUE: readonly CatalogItemView[] = [
  item('BAG', 'pain'),
  item('SEI', 'pain'),
  item('CRO', 'viennoiserie'),
];

describe('le groupement de la fiche d’atelier', () => {
  it('groupe par rayon, dans l’ordre de la vitrine et non par poids', () => {
    // La baguette pèse cinquante fois le croissant, mais « Viennoiseries » vient
    // avant « Pains » au catalogue : c'est l'ordre que l'équipe connaît déjà.
    const groups = worksheetGroups(
      [line('BAG', 'Baguette', 500), line('CRO', 'Croissant', 10)],
      CATALOGUE,
    );

    expect(groups.map((group) => group.key)).toEqual(['viennoiserie', 'pain']);
  });

  it('trie un rayon par quantité décroissante — on commence par le plus gros', () => {
    const groups = worksheetGroups(
      [line('SEI', 'Pain de seigle', 30), line('BAG', 'Baguette', 160)],
      CATALOGUE,
    );

    expect(groups[0]?.lines.map((l) => l.sku)).toEqual(['BAG', 'SEI']);
  });

  it('compte les cochées, le total et surtout ce qu’il RESTE', () => {
    const groups = worksheetGroups(
      [line('BAG', 'Baguette', 160, true), line('SEI', 'Pain de seigle', 30)],
      CATALOGUE,
    );

    expect(groups[0]).toMatchObject({ doneCount: 1, totalUnits: 190, remainingUnits: 30 });
  });

  it('range un SKU inconnu du catalogue à part, en fin de liste', () => {
    const groups = worksheetGroups(
      [line('???', 'Produit retiré', 4), line('BAG', 'Baguette', 160)],
      CATALOGUE,
    );

    expect(groups.map((group) => group.key)).toEqual(['pain', UNSHELVED_KEY]);
    expect(groups[1]?.label).toBe('Hors catalogue');
  });

  it('🔴 dit la PANNE quand le catalogue n’a pas pu être lu, pas « hors catalogue »', () => {
    // Sans cette distinction, une lecture ratée range TOUT sous « Hors
    // catalogue » — et la fiche affirme que le fournil fabrique des produits
    // retirés de la vente. Un mensonge plausible est le pire des deux.
    const groups = worksheetGroups([line('BAG', 'Baguette', 160)], [], false);

    expect(groups[0]?.label).toBe('Rayon inconnu');
  });

  it('garde la place d’une ligne quand elle est cochée', () => {
    // Une ligne qui remonterait en se cochant ferait perdre la sienne à
    // quelqu'un qui a les mains dans la farine : la case suivante n'est plus
    // celle qu'on visait.
    const before = worksheetGroups(
      [line('BAG', 'Baguette', 160), line('SEI', 'Pain de seigle', 30)],
      CATALOGUE,
    );
    const after = worksheetGroups(
      [line('BAG', 'Baguette', 160, true), line('SEI', 'Pain de seigle', 30)],
      CATALOGUE,
    );

    expect(after[0]?.lines.map((l) => l.sku)).toEqual(before[0]?.lines.map((l) => l.sku));
  });
});
