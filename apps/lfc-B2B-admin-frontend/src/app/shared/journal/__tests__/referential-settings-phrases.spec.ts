import { isJournalFactType, journalPayloadShapes } from '@lfd/contracts/journal-facts';
import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput, type RenderedFact } from '../render-fact';

/**
 * **Les phrases de ce qui règle le référentiel** — règles comptables, points
 * et contextes de vente, provenance, allergènes, heures limites (famille
 * `referentialSettings`, plan des phrases du journal, lot D, 2026-09-19) :
 * chaque type sur sa forme courante, et sur ses formes d'avant quand il en a.
 *
 * Chaque charge d'exemple est d'abord confrontée au catalogue : une phrase
 * éprouvée sur une forme qui n'a jamais existé ne prouverait rien.
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

/** Le fait rendu — après avoir vérifié que sa charge est une forme du catalogue. */
function render(input: FactInput): RenderedFact {
  const type = input.type;
  expect(isJournalFactType(type)).toBe(true);
  const shapes = isJournalFactType(type) ? journalPayloadShapes(type) : [];
  expect(shapes.some((shape) => shape.safeParse(input.payload).success)).toBe(true);
  return renderFact(input);
}

const sentence = (input: FactInput): string => render(input).sentence;
const labels = (input: FactInput): string[] => render(input).detail.map((row) => row.label);

describe('les règles comptables', () => {
  it('dit la méthode du prix professionnel par son mot, et une valeur inconnue telle quelle', () => {
    const fact = on('accounting_rules', 'accounting_rules.method_changed', {
      subjectLabel: 'Règles comptables',
      from: 'remise_apres_tva_max',
      to: 'ratio_ttc',
    });
    const before = on('accounting_rules', 'accounting_rules.method_changed', {
      from: 'ratio_ttc',
      to: 'nouvelle_methode',
    });

    expect(sentence(fact)).toBe(
      'Colette Martin a changé, dans les règles comptables, la méthode du prix professionnel de « Remise après plus haute TVA possible » à « Ratio TTC pré-remise »',
    );
    expect(render(fact).detail).toEqual([]);
    expect(sentence(before)).toBe(
      'Colette Martin a changé, dans les règles comptables, la méthode du prix professionnel de « Ratio TTC pré-remise » à « nouvelle_methode »',
    );
  });

  it('dit le rapport prix professionnel / prix public, premier réglage compris', () => {
    const first = on('accounting_rules', 'accounting_rules.pro_ratio_changed', {
      subjectLabel: 'Règles comptables',
      from: null,
      to: 9000,
    });
    const next = on('accounting_rules', 'accounting_rules.pro_ratio_changed', {
      from: 9000,
      to: 8800,
    });

    expect(sentence(first)).toMatch(
      /^Colette Martin a fixé, dans les règles comptables, le prix professionnel à 90\s%\sdu prix public$/u,
    );
    expect(sentence(next)).toMatch(
      /^Colette Martin a passé, dans les règles comptables, le prix professionnel de 90\s% à 88\s%\sdu prix public$/u,
    );
    expect(render(next).detail).toEqual([]);
  });
});

describe('les points de vente', () => {
  it('dit la création : sa sorte, ses contextes, ses tables', () => {
    const current = on('point_of_sale', 'point_of_sale.created', {
      subjectLabel: 'Gare',
      kind: 'shop',
      label: 'Gare',
      contexts: [
        { id: 'takeaway', name: 'À emporter' },
        { id: 'eatIn', name: 'Sur place' },
      ],
      tableCount: 12,
    });
    const before = on('point_of_sale', 'point_of_sale.created', {
      kind: 'platform',
      label: 'Plateforme pro',
      contexts: ['b2b'],
      tableCount: 0,
    });

    expect(sentence(current)).toBe(
      'Colette Martin a créé le point de vente « Gare » (boutique), qui offre « À emporter » et « Sur place », avec 12 tables',
    );
    expect(render(current).detail).toEqual([]);
    // Les contextes d'avant le lot B ne sont que des clés : au détail.
    expect(sentence(before)).toBe(
      'Colette Martin a créé le point de vente « Plateforme pro » (plateforme), sans table',
    );
    expect(render(before).detail).toEqual([
      { label: 'Contextes de vente', value: '(identifiant b2b)' },
    ]);
  });

  it('dit la modification, la suppression, et les QR codes de table', () => {
    const updated = on('point_of_sale', 'point_of_sale.updated', {
      subjectLabel: 'Gare',
      changes: { tableCount: { from: 12, to: 14 } },
    });
    const updatedBefore = on('point_of_sale', 'point_of_sale.updated', {
      changes: { contexts: { from: 'takeaway', to: 'takeaway eatIn' } },
    });
    const deleted = on('point_of_sale', 'point_of_sale.deleted', {
      subjectLabel: 'Gare',
      label: 'Gare',
      tableCount: 12,
    });
    const generated = on('point_of_sale', 'point_of_sale.table_qr_generated', {
      subjectLabel: 'Gare',
      table: 4,
    });
    const removed = on('point_of_sale', 'point_of_sale.table_qr_removed', { table: 4 });

    expect(sentence(updated)).toBe('Colette Martin a modifié le point de vente « Gare » : tables');
    expect(sentence(updatedBefore)).toBe(
      'Colette Martin a modifié un point de vente : contextes de vente',
    );
    expect(sentence(deleted)).toBe(
      'Colette Martin a supprimé le point de vente « Gare » et ses 12 tables',
    );
    expect(render(deleted).detail).toEqual([]);
    expect(sentence(generated)).toBe(
      'Colette Martin a généré le QR code de la table 4 du point de vente « Gare »',
    );
    expect(sentence(removed)).toBe(
      'Colette Martin a retiré le QR code de la table 4 d’un point de vente',
    );
  });
});

describe('les contextes de vente', () => {
  it('dit la création, la modification et la suppression', () => {
    const created = on('sales_context', 'sales_context.created', {
      subjectLabel: 'Livraison',
      key: 'delivery',
      label: 'Livraison',
      active: false,
      shopifyProjected: true,
    });
    const updated = on('sales_context', 'sales_context.updated', {
      subjectLabel: 'Livraison',
      changes: { active: { from: false, to: true } },
    });
    const deleted = on('sales_context', 'sales_context.deleted', {
      key: 'delivery',
      label: 'Livraison',
    });

    expect(sentence(created)).toBe(
      'Colette Martin a créé le contexte de vente « Livraison », inactif',
    );
    expect(labels(created)).toEqual(['Clé', 'Publié sur Shopify']);
    expect(sentence(updated)).toBe(
      'Colette Martin a modifié le contexte de vente « Livraison » : actif',
    );
    expect(sentence(deleted)).toBe('Colette Martin a supprimé le contexte de vente « Livraison »');
    expect(labels(deleted)).toEqual(['Clé']);
  });
});

describe('la provenance', () => {
  it('dit les appellations', () => {
    const created = on('appellation', 'appellation.created', {
      subjectLabel: 'Comté',
      code: 'comte',
      label: { fr: 'Comté' },
      scheme: 'AOP',
    });
    const updated = on('appellation', 'appellation.updated', {
      changes: { scheme: { from: 'AOC', to: 'AOP' } },
    });
    const deleted = on('appellation', 'appellation.deleted', { label: { fr: 'Comté' } });

    expect(sentence(created)).toBe('Colette Martin a créé l’appellation « Comté » (AOP)');
    expect(labels(created)).toEqual(['Code']);
    expect(sentence(updated)).toBe('Colette Martin a modifié une appellation : régime');
    expect(sentence(deleted)).toBe('Colette Martin a supprimé l’appellation « Comté »');
  });

  it('dit l’ingrédient créé, son origine et son appellation — le code seul d’avant le lot B', () => {
    const current = on('ingredient', 'ingredient.created', {
      subjectLabel: 'Beurre',
      key: 'beurre',
      name: { fr: 'Beurre' },
      origin: 'Charentes',
      appellation: { id: 'bcp', name: 'Beurre Charentes-Poitou' },
    });
    const before = on('ingredient', 'ingredient.created', {
      key: 'beurre',
      name: { fr: 'Beurre' },
      origin: '',
      appellation: 'bcp',
    });

    expect(sentence(current)).toBe(
      'Colette Martin a créé l’ingrédient « Beurre » (origine : Charentes), sous l’appellation « Beurre Charentes-Poitou »',
    );
    expect(labels(current)).toEqual(['Clé']);
    expect(sentence(before)).toBe(
      'Colette Martin a créé l’ingrédient « Beurre », sous une appellation (identifiant bcp)',
    );
  });

  it('dit la modification, la suppression et les allergènes d’un ingrédient', () => {
    const updated = on('ingredient', 'ingredient.updated', {
      subjectLabel: 'Beurre',
      changes: { appellation: { from: null, to: { id: 'bcp', name: 'Beurre Charentes-Poitou' } } },
    });
    const updatedBefore = on('ingredient', 'ingredient.updated', {
      changes: { appellationId: { from: null, to: 'bcp' } },
    });
    const deleted = on('ingredient', 'ingredient.deleted', {
      subjectLabel: 'Beurre',
      name: { fr: 'Beurre', en: 'Butter' },
    });
    const allergens = on('ingredient', 'ingredient.allergens_saved', {
      subjectLabel: 'Beurre',
      changes: { allergens: { from: [], to: ['A07'] } },
    });

    expect(sentence(updated)).toBe(
      'Colette Martin a modifié l’ingrédient « Beurre » : appellation',
    );
    expect(sentence(updatedBefore)).toBe('Colette Martin a modifié un ingrédient : appellation');
    expect(sentence(deleted)).toBe('Colette Martin a supprimé l’ingrédient « Beurre »');
    // La traduction n'est pas dite : le détail la rend.
    expect(labels(deleted)).toEqual(['Nom']);
    expect(sentence(allergens)).toBe(
      'Colette Martin a modifié les allergènes de l’ingrédient « Beurre »',
    );
    expect(labels(allergens)).toEqual(['Allergènes']);
  });
});

describe('les allergènes', () => {
  it('dit la vie d’une catégorie d’allergènes', () => {
    const created = on('allergen_category', 'allergen_category.created', {
      subjectLabel: 'Céréales',
      key: 'cereales',
      name: { fr: 'Céréales' },
      position: 3,
    });
    const renamed = on('allergen_category', 'allergen_category.renamed', {
      key: 'cereales',
      from: { fr: 'Céréales' },
      to: { fr: 'Céréales à gluten' },
    });
    const reordered = on('allergen_category', 'allergen_category.reordered', {
      subjectLabel: 'Céréales',
      key: 'cereales',
      from: 10,
      to: 20,
    });
    const archived = on('allergen_category', 'allergen_category.archived', {
      key: 'cereales',
      name: { fr: 'Céréales' },
    });
    const restored = on('allergen_category', 'allergen_category.restored', {
      subjectLabel: 'Céréales',
      key: 'cereales',
      name: { fr: 'Céréales' },
    });

    expect(sentence(created)).toBe('Colette Martin a créé la catégorie d’allergènes « Céréales »');
    expect(labels(created)).toEqual(['Clé', 'Rang']);
    expect(sentence(renamed)).toBe(
      'Colette Martin a renommé la catégorie d’allergènes « Céréales » en « Céréales à gluten »',
    );
    expect(labels(renamed)).toEqual(['Clé']);
    expect(sentence(reordered)).toBe(
      'Colette Martin a déplacé la catégorie d’allergènes « Céréales » de la position 10 à la position 20',
    );
    expect(sentence(archived)).toBe(
      'Colette Martin a archivé la catégorie d’allergènes « Céréales »',
    );
    expect(sentence(restored)).toBe(
      'Colette Martin a restauré la catégorie d’allergènes « Céréales »',
    );
  });

  it('dit la vie d’un allergène — sa catégorie par sa seule clé d’avant le lot B', () => {
    const current = on('allergen_entry', 'allergen_entry.created', {
      subjectLabel: 'Lait',
      code: 'A07',
      name: { fr: 'Lait' },
      category: { id: 'cat_lait', name: 'Produits laitiers' },
    });
    const before = on('allergen_entry', 'allergen_entry.created', {
      code: 'A07',
      name: { fr: 'Lait' },
      category: 'laitiers',
    });
    const updated = on('allergen_entry', 'allergen_entry.updated', {
      code: 'A07',
      changes: { categoryId: { from: 'cat_1', to: 'cat_2' } },
    });
    const archived = on('allergen_entry', 'allergen_entry.archived', {
      subjectLabel: 'Lait',
      code: 'A07',
      name: { fr: 'Lait' },
    });
    const restored = on('allergen_entry', 'allergen_entry.restored', {
      code: 'A07',
      name: { fr: 'Lait' },
    });

    expect(sentence(current)).toBe(
      'Colette Martin a créé l’allergène « Lait » dans la catégorie « Produits laitiers »',
    );
    expect(labels(current)).toEqual(['Code']);
    expect(sentence(before)).toBe(
      'Colette Martin a créé l’allergène « Lait » dans une catégorie (identifiant laitiers)',
    );
    expect(sentence(updated)).toBe('Colette Martin a modifié un allergène : catégorie');
    expect(sentence(archived)).toBe('Colette Martin a archivé l’allergène « Lait »');
    expect(sentence(restored)).toBe('Colette Martin a restauré l’allergène « Lait »');
  });
});

describe('les heures limites de commande', () => {
  it('dit la portée et les valeurs posées ; une valeur qui ne se prononce pas reste au détail', () => {
    const set = on('order_time_limit', 'order_time_limit.set', {
      subjectLabel: 'Famille « Tartes »',
      scope: 'category:cat_1',
      daysBefore: 1,
      time: '17:30',
      graceMinutes: null,
    });
    const before = on('order_time_limit', 'order_time_limit.set', {
      scope: 'global:',
      daysBefore: 0,
      time: '09:00',
      graceMinutes: 15,
    });

    expect(sentence(set)).toBe(
      'Colette Martin a réglé l’heure limite de commande (Famille « Tartes ») : 1 jour avant, à 17:30',
    );
    expect(render(set).detail).toEqual([{ label: 'Tolérance', value: 'aucun' }]);
    expect(sentence(before)).toBe(
      'Colette Martin a réglé l’heure limite de commande (Toute la production) : le jour même, à 09:00, 15 min de tolérance',
    );
  });

  it('dit la suppression, et la cible d’une ligne d’avant le lot B par son identifiant', () => {
    const removed = on('order_time_limit', 'order_time_limit.removed', {
      subjectLabel: 'Produit « VIE-001 »',
      scope: 'product:prd_1',
      daysBefore: 2,
      time: null,
      graceMinutes: null,
    });
    const before = on('order_time_limit', 'order_time_limit.removed', {
      scope: 'product:prd_1',
      daysBefore: 2,
      time: null,
      graceMinutes: null,
    });

    expect(sentence(removed)).toBe(
      'Colette Martin a supprimé l’heure limite de commande (Produit « VIE-001 »)',
    );
    expect(labels(removed)).toEqual(['Jours avant', 'Heure', 'Tolérance']);
    expect(sentence(before)).toBe(
      'Colette Martin a supprimé l’heure limite de commande (Produit (identifiant prd_1))',
    );
  });
});

describe('la portée d’un changement de taux, sous sa forme d’août 2026', () => {
  /**
   * Régression : du 2026-08-21 (`6959131d`) au 2026-08-24 (`5d526662`), la
   * portée tenait en trois comptes nommés. Le catalogue ne connaissait que
   * `families: { <contexte>: n }` : aucune forme n'acceptait ces lignes, et
   * leur charge entière sortait brute.
   */
  it('lit la charge sous sa forme, et nomme chaque compte', () => {
    const fact = on('vat_rate', 'vat_rate.rate_changed', {
      name: 'Réduit',
      from: 5.5,
      to: 10,
      blast: { familiesEmporter: 3, familiesSurPlace: 1, familiesB2b: 0 },
    });

    expect(render(fact).detail).toEqual([
      { label: 'Portée › Familles à emporter', value: '3' },
      { label: 'Portée › Familles sur place', value: '1' },
      { label: 'Portée › Familles B2B', value: '0' },
    ]);
    expect(render(fact).unlabelled).toEqual([]);
  });
});
