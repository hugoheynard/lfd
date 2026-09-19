import { isJournalFactType, journalPayloadShapes } from '@lfd/contracts/journal-facts';
import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput, type RenderedFact } from '../render-fact';

/**
 * **Les phrases du référentiel — fiches, déclinaisons, familles, révisions**
 * (famille `referentialCatalogue`, plan des phrases du journal, lot D,
 * 2026-09-19) : chaque type sur sa forme courante, et sur ses formes d'avant
 * quand il en a — une ligne ancienne se lit sans « undefined » et sans
 * inventer de nom.
 *
 * Chaque charge d'exemple est d'abord confrontée au catalogue : une phrase
 * éprouvée sur une forme qui n'a jamais existé ne prouverait rien.
 */

const TART = 'Tarte citron';

function on(
  subjectType: string,
  type: string,
  payload: Record<string, unknown>,
  subjectId = `${subjectType}_1`,
): FactInput {
  return { type, payload, subjectType, subjectId, actorName: 'Colette Martin', actorType: 'staff' };
}

const product = (type: string, payload: Record<string, unknown>): FactInput =>
  on('product', type, payload);
const family = (type: string, payload: Record<string, unknown>, id = 'cat_1'): FactInput =>
  on('product_category', type, payload, id);
const revision = (type: string, payload: Record<string, unknown>): FactInput =>
  on('catalog_revision', type, payload);

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

describe('la vie d’une fiche', () => {
  it('dit la création : la fiche, son SKU, sa sorte, sa famille', () => {
    const current = product('product.created', {
      subjectLabel: TART,
      sku: 'TAR-001',
      name: { fr: TART },
      kind: 'daily',
      category: { id: 'cat_1', name: 'Tartes' },
      declared: true,
    });
    const before = product('product.created', {
      sku: 'TAR-001',
      name: { fr: TART, en: 'Lemon tart' },
      kind: 'made_to_order',
      categoryId: 'cat_1',
      declared: false,
    });

    expect(sentence(current)).toBe(
      'Colette Martin a créé la fiche « Tarte citron » (TAR-001), frais du jour, dans la famille « Tartes », avec sa fiche réglementaire',
    );
    expect(render(current).detail).toEqual([]);
    expect(sentence(before)).toBe(
      'Colette Martin a créé la fiche « Tarte citron » (TAR-001), sur commande, dans une famille (identifiant cat_1), sans fiche réglementaire',
    );
    // La traduction n'est pas dite : le détail la rend.
    expect(render(before).detail).toEqual([
      { label: 'Nom', value: 'Tarte citron (anglais : Lemon tart)' },
    ]);
  });

  it('nomme les sections modifiées, et laisse les valeurs au détail', () => {
    const identity = product('product.identity_saved', {
      subjectLabel: TART,
      changes: { kind: { from: 'daily', to: 'resale' } },
    });
    const editorial = product('product.editorial_saved', {
      changes: { descriptionShort: { from: null, to: { fr: 'Acidulée' } } },
    });
    const media = product('product.media_saved', { subjectLabel: TART, changes: {} });

    expect(sentence(identity)).toBe(
      'Colette Martin a modifié l’identité de « Tarte citron » : sorte',
    );
    expect(render(identity).detail).toEqual([{ label: 'Sorte', value: 'Frais du jour → Revente' }]);
    expect(sentence(editorial)).toBe(
      'Colette Martin a modifié les textes d’une fiche : description courte',
    );
    expect(sentence(media)).toBe(
      'Colette Martin a modifié les visuels de « Tarte citron » (aucun changement)',
    );
  });

  it('dit le changement de famille — sans réciter deux identifiants sur une ligne ancienne', () => {
    const current = product('product.reclassified', {
      subjectLabel: TART,
      from: { id: 'cat_1', name: 'Tartes' },
      to: { id: 'cat_2', name: 'Entremets' },
    });
    const before = product('product.reclassified', { from: 'cat_1', to: 'cat_2' });

    expect(sentence(current)).toBe(
      'Colette Martin a fait passer la fiche « Tarte citron » de la famille « Tartes » à la famille « Entremets »',
    );
    expect(render(current).detail).toEqual([]);
    expect(sentence(before)).toBe('Colette Martin a changé la famille d’une fiche');
    expect(labels(before)).toEqual(['Avant', 'Après']);
  });

  it('dit le tarif d’une déclinaison, prix et poids, premier réglage compris', () => {
    const current = product('product.pricing_saved', {
      subjectLabel: TART,
      variant: { id: 'var_1', name: '6 parts' },
      changes: {
        priceCents: { from: 1200, to: 1350 },
        weightGrams: { from: null, to: 450 },
      },
    });
    const before = product('product.pricing_saved', {
      variantId: 'var_1',
      changes: { priceCents: { from: 1200, to: null } },
    });

    expect(sentence(current)).toMatch(
      /^Colette Martin a modifié le tarif de « Tarte citron », déclinaison « 6 parts » : prix TTC de 12,00\s€ à 13,50\s€ et poids fixé à 450 g$/u,
    );
    expect(render(current).detail).toEqual([]);
    expect(sentence(before)).toMatch(
      /^Colette Martin a modifié le tarif d’une fiche, une déclinaison \(identifiant var_1\) : prix TTC retiré \(il était de 12,00\s€\)$/u,
    );
  });

  it('dit la fiche réglementaire modifiée, les champs, et sa déclinaison', () => {
    const fact = product('product.declaration_saved', {
      subjectLabel: TART,
      variant: { id: 'var_1', name: '6 parts' },
      changes: { allergens: { from: null, to: ['A01'] }, energyKcal: { from: 250, to: 260 } },
    });

    expect(sentence(fact)).toBe(
      'Colette Martin a modifié la fiche réglementaire de « Tarte citron », déclinaison « 6 parts » : allergènes, énergie',
    );
    expect(labels(fact)).toEqual(['Allergènes', 'Énergie']);
  });

  it('dit où se vend la fiche : ses propres canaux, ou ceux de sa famille', () => {
    const own = product('product.channels_changed', {
      subjectLabel: TART,
      from: 'inherited',
      to: [
        {
          pointOfSale: { id: 'pos_1', name: 'Gare' },
          context: { id: 'takeaway', name: 'À emporter' },
        },
      ],
    });
    const back = product('product.channels_changed', {
      from: [{ pointOfSaleId: 'pos_1', context: 'takeaway' }],
      to: 'inherited',
    });

    expect(sentence(own)).toBe(
      'Colette Martin a donné à « Tarte citron » ses propres canaux de vente',
    );
    expect(render(own).detail).toEqual([
      { label: 'Après', value: 'Point de vente : Gare · Contexte de vente : À emporter' },
    ]);
    expect(sentence(back)).toBe(
      'Colette Martin a remis une fiche sur les canaux de vente de sa famille',
    );
  });

  it('dit les taux par contexte, de l’un à l’autre, et d’aucun à un taux', () => {
    const fact = product('product.vat_changed', {
      subjectLabel: TART,
      vatByContext: {
        takeaway: { from: { id: 'tva_1', name: 'Réduit' }, to: { id: 'tva_2', name: 'Normal' } },
        b2b: { from: null, to: { id: 'tva_1', name: 'Réduit' } },
      },
    });

    expect(sentence(fact)).toBe(
      'Colette Martin a passé le taux à emporter de « Tarte citron » de « Réduit » à « Normal » et le taux B2B d’aucun taux à « Réduit »',
    );
    expect(render(fact).detail).toEqual([]);
  });

  it('dit le taux d’une famille comme le guide l’écrit, et la forme d’avant le lot B sans ses ids', () => {
    const current = family('product_category.vat_changed', {
      subjectLabel: 'Tartes',
      vatByContext: {
        takeaway: {
          from: { id: 'tva_1', name: 'Réduit' },
          to: { id: 'tva_3', name: 'Intermédiaire' },
        },
      },
    });
    const before = family('product_category.vat_changed', {
      emporter: { from: 'tva_1', to: 'tva_2' },
    });

    expect(sentence(current)).toBe(
      'Colette Martin a passé le taux à emporter de la famille « Tartes » de « Réduit » à « Intermédiaire »',
    );
    expect(sentence(before)).toBe('Colette Martin a changé les taux de TVA d’une famille');
    expect(render(before).detail).toEqual([
      { label: 'À emporter', value: '(identifiant tva_1) → (identifiant tva_2)' },
    ]);
  });

  it('dit la déclaration, l’archivage et la restauration, le SKU à côté du nom', () => {
    const ready = product('product.declared_ready', {
      subjectLabel: TART,
      sku: 'TAR-001',
      name: { fr: TART },
    });
    const archived = product('product.archived', { sku: 'TAR-001', name: { fr: TART } });
    const restored = product('product.restored', {
      subjectLabel: TART,
      sku: 'TAR-001',
      name: { fr: TART },
    });

    expect(sentence(ready)).toBe(
      'Colette Martin a déclaré la fiche « Tarte citron » (TAR-001) prête à publier',
    );
    expect(sentence(archived)).toBe('Colette Martin a archivé la fiche « Tarte citron » (TAR-001)');
    expect(sentence(restored)).toBe(
      'Colette Martin a restauré la fiche « Tarte citron » (TAR-001)',
    );
    expect(render(restored).detail).toEqual([]);
  });

  it('dit les ingrédients d’une fiche qu’il ne nomme pas, et la lie', () => {
    const current = product('product.ingredients_saved', {
      changes: {
        ingredients: {
          from: [],
          to: [
            { id: 'beurre', name: 'Beurre' },
            { id: 'farine', name: 'Farine' },
          ],
        },
      },
    });
    const before = product('product.ingredients_saved', {
      changes: { ingredients: { from: ['beurre'], to: [] } },
    });

    expect(sentence(current)).toBe('Colette Martin a modifié les ingrédients d’une fiche');
    expect(render(current).segments).toContainEqual({
      kind: 'subject',
      text: 'une fiche',
      route: '/pim/produits/product_1',
    });
    expect(render(current).detail).toEqual([
      { label: 'Ingrédients', value: 'aucun → Beurre ; Farine' },
    ]);
    expect(sentence(before)).toBe('Colette Martin a modifié les ingrédients d’une fiche');
  });
});

describe('les déclinaisons', () => {
  it('dit l’ajout, avec son SKU et la fiche', () => {
    const fact = product('variant.added', {
      subjectLabel: TART,
      sku: 'TAR-001-6',
      name: { fr: '6 parts' },
      options: { Taille: '6 parts' },
    });
    const before = product('variant.added', {
      sku: 'TAR-001-6',
      name: { fr: '6 parts' },
      options: {},
    });

    expect(sentence(fact)).toBe(
      'Colette Martin a ajouté la déclinaison « 6 parts » (TAR-001-6) à « Tarte citron »',
    );
    expect(labels(fact)).toEqual(['Options › Taille']);
    expect(sentence(before)).toBe(
      'Colette Martin a ajouté la déclinaison « 6 parts » (TAR-001-6) à une fiche',
    );
  });

  it('dit l’alignement sur le défaut, et le détachement', () => {
    const aligned = product('variant.aligned', {
      subjectLabel: TART,
      sku: 'TAR-001-6',
      aspect: 'pricing',
      aligned: true,
    });
    const detached = product('variant.aligned', {
      sku: 'TAR-001-6',
      aspect: 'regulatory',
      aligned: false,
    });
    const retired = product('variant.regulatory_aligned', { sku: 'TAR-001-6', aligned: true });

    expect(sentence(aligned)).toBe(
      'Colette Martin a aligné le tarif de la déclinaison TAR-001-6 de « Tarte citron » sur la déclinaison par défaut',
    );
    expect(render(aligned).detail).toEqual([]);
    expect(sentence(detached)).toBe(
      'Colette Martin a rendu à la déclinaison TAR-001-6 sa propre fiche réglementaire',
    );
    expect(sentence(retired)).toBe(
      'Colette Martin a aligné la fiche réglementaire de la déclinaison TAR-001-6 sur la déclinaison par défaut',
    );
  });

  it('dit le renommage par les noms du diff — sur la forme courante et sur celle d’avant', () => {
    const current = product('variant.renamed', {
      subjectLabel: TART,
      variant: { id: 'var_1', name: '6 parts' },
      changes: { name: { from: { fr: 'Petite' }, to: { fr: '6 parts' } } },
    });
    const before = product('variant.renamed', {
      variantId: 'var_1',
      changes: { name: { from: null, to: { fr: '6 parts', en: 'Six slices' } } },
    });

    expect(sentence(current)).toBe(
      'Colette Martin a renommé la déclinaison « Petite » de « Tarte citron » en « 6 parts »',
    );
    expect(render(current).detail).toEqual([]);
    expect(sentence(before)).toBe('Colette Martin a nommé « 6 parts » une déclinaison d’une fiche');
    expect(labels(before)).toEqual(['Déclinaison', 'Nom']);
  });
});

describe('les familles', () => {
  it('dit la création, et la famille parente quand il y en a une', () => {
    const under = family('product_category.created', {
      subjectLabel: 'Tartes',
      name: { fr: 'Tartes' },
      parent: { id: 'cat_0', name: 'Pâtisserie' },
    });
    const before = family('product_category.created', { name: { fr: 'Tartes' }, parentId: null });

    expect(sentence(under)).toBe(
      'Colette Martin a créé la famille « Tartes » sous la famille « Pâtisserie »',
    );
    expect(render(under).detail).toEqual([]);
    expect(sentence(before)).toBe('Colette Martin a créé la famille « Tartes »');
    expect(render(before).detail).toEqual([{ label: 'Famille parente', value: 'aucun' }]);
  });

  it('dit le renommage, l’archivage et le déplacement', () => {
    const renamed = family('product_category.renamed', {
      subjectLabel: 'Tartes et tourtes',
      changes: { name: { from: { fr: 'Tartes' }, to: { fr: 'Tartes et tourtes' } } },
    });
    const archived = family('product_category.archived', { name: { fr: 'Tartes' } });
    const moved = family('product_category.moved', {
      subjectLabel: 'Tartes',
      parent: { from: null, to: { id: 'cat_0', name: 'Pâtisserie' } },
    });
    const movedBefore = family('product_category.moved', {
      parentId: { from: 'cat_0', to: null },
    });

    expect(sentence(renamed)).toBe(
      'Colette Martin a renommé la famille « Tartes » en « Tartes et tourtes »',
    );
    expect(render(renamed).detail).toEqual([]);
    expect(sentence(archived)).toBe('Colette Martin a archivé la famille « Tartes »');
    expect(sentence(moved)).toBe(
      'Colette Martin a déplacé la famille « Tartes » sous la famille « Pâtisserie » (elle était au premier niveau du catalogue)',
    );
    expect(sentence(movedBefore)).toBe('Colette Martin a déplacé une famille');
    expect(render(movedBefore).detail).toEqual([
      { label: 'Famille parente', value: '(identifiant cat_0) → aucun' },
    ]);
  });

  it('dit le réordonnancement d’un niveau, la racine comprise', () => {
    const nested = family('product_category.reordered', {
      subjectLabel: 'Pâtisserie',
      order: [
        { id: 'cat_1', name: 'Tartes' },
        { id: 'cat_2', name: 'Entremets' },
      ],
    });
    const root = family('product_category.reordered', { order: ['cat_1', 'cat_2'] }, 'root');

    expect(sentence(nested)).toBe(
      'Colette Martin a réordonné les sous-familles de « Pâtisserie » : Tartes et Entremets',
    );
    expect(sentence(root)).toBe(
      'Colette Martin a réordonné les familles du premier niveau du catalogue',
    );
    expect(labels(root)).toEqual(['Ordre']);
  });

  it('nomme les sections modifiées d’une famille', () => {
    const channels = family('product_category.channels_changed', {
      subjectLabel: 'Tartes',
      changes: {},
    });
    const editorial = family('product_category.editorial_saved', {
      subjectLabel: 'Tartes',
      changes: { seoTitle: { from: null, to: { fr: 'Nos tartes' } } },
    });
    const media = family('product_category.media_saved', { changes: {} });

    expect(sentence(channels)).toBe(
      'Colette Martin a modifié les canaux de vente de la famille « Tartes » (aucun changement)',
    );
    expect(sentence(editorial)).toBe(
      'Colette Martin a modifié les textes de la famille « Tartes » : titre pour les moteurs de recherche',
    );
    expect(sentence(media)).toBe(
      'Colette Martin a modifié les visuels d’une famille (aucun changement)',
    );
  });
});

describe('les révisions du catalogue', () => {
  it('dit la pose, nommée ou non', () => {
    const named = revision('catalog_revision.taken', {
      subjectLabel: 'Rentrée',
      hash: 'abc123',
      label: 'Rentrée',
      note: null,
      blast: { articles: 40 },
    });
    const unnamed = revision('catalog_revision.taken', {
      hash: 'abc123',
      label: null,
      note: 'Avant les prix d’automne',
    });

    expect(sentence(named)).toBe('Colette Martin a posé la révision « Rentrée » du catalogue');
    expect(sentence(unnamed)).toBe('Colette Martin a posé une révision du catalogue, sans nom');
    expect(labels(unnamed)).toEqual(['Empreinte', 'Note']);
  });

  it('dit le nom donné à une révision', () => {
    const fact = revision('catalog_revision.named', {
      subjectLabel: 'Rentrée',
      reference: 'R-7WT4NA',
      label: 'Rentrée',
    });

    expect(sentence(fact)).toBe('Colette Martin a nommé « Rentrée » la révision R-7WT4NA');
    expect(render(fact).detail).toEqual([]);
  });

  it('dit l’envoi, ou sa simulation, et ce qu’il emporte', () => {
    const live = revision('catalog_revision.pushed', {
      subjectLabel: 'Rentrée',
      reference: 'R-7WT4NA',
      channel: 'b2b',
      mode: 'live',
      candidates: 40,
      excluded: 2,
    });
    const before = revision('catalog_revision.pushed', {
      channel: 'b2b',
      mode: 'dry-run',
      candidates: 1,
      excluded: 0,
      blast: { articles: 1 },
    });

    expect(sentence(live)).toBe(
      'Colette Martin a envoyé la révision « Rentrée » (R-7WT4NA) vers la plateforme professionnelle : 40 articles candidats et 2 écartés',
    );
    expect(render(live).detail).toEqual([]);
    expect(sentence(before)).toBe(
      'Colette Martin a simulé l’envoi d’une révision vers la plateforme professionnelle : 1 article candidat et 0 écarté',
    );
  });
});
