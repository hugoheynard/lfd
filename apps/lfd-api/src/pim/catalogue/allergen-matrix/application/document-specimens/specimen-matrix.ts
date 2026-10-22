import type { IncoCategory } from "../../../../allergens/domain/value-objects/inco-category.js";
import type {
  AllergenMatrix,
  MatrixColumn,
  MatrixFilters,
  MatrixRow,
} from "../../domain/allergen-matrix.js";
import type { AllergenMatrixPaper } from "../../domain/allergen-matrix-pdf.js";
import type { MatrixCell, MatrixOthersCell, MatrixRowState } from "../../domain/matrix-row.js";

/**
 * **Les données d'exemple de la matrice des allergènes** — la planche des
 * documents de la Comptabilité
 * (`documentation/comptabilite/planche-des-documents.md`).
 *
 * 🔴 **Elles ne sont JAMAIS persistées, et aucune fiche n'est lue.** La
 * matrice est posée telle que `buildAllergenMatrix` la rend, sans passer par
 * lui : il demande des fiches réelles (`ProductRecord`) et le référentiel en
 * base, et un exemple qui lirait le catalogue montrerait le catalogue, pas le
 * papier. Ce qui est éprouvé ici est le RENDU — colonnes, cases, « Autres »,
 * états, pied —, avec un produit par sort qu'une ligne peut connaître.
 *
 * Tout ce qui désigne un produit dit « EXEMPLE » ; les SKU sont en `EXEMPLE-…`
 * et n'appartiennent à aucune fiche.
 */

/** Les quatorze mentions de l'annexe II, dans l'ordre du règlement. */
const COLUMNS: readonly MatrixColumn[] = [
  column("gluten", "Céréales contenant du gluten", "Gluten"),
  column("crustaceans", "Crustacés"),
  column("eggs", "Œufs"),
  column("fish", "Poissons"),
  column("peanuts", "Arachides"),
  column("soybeans", "Soja"),
  column("milk", "Lait"),
  column("tree_nuts", "Fruits à coque"),
  column("celery", "Céleri"),
  column("mustard", "Moutarde"),
  column("sesame", "Graines de sésame", "Sésame"),
  column("sulphites", "Anhydride sulfureux et sulfites", "Sulfites"),
  column("lupin", "Lupin"),
  column("molluscs", "Mollusques"),
];

function column(category: IncoCategory, label: string, header: string = label): MatrixColumn {
  return { category, label, header };
}

/** Ce qu'une ligne déclare : la catégorie et, pour les deux qui se nomment, quoi. */
type Declared = Readonly<Partial<Record<IncoCategory, readonly string[]>>>;

interface SpecimenProduct {
  readonly sku: string;
  readonly name: string;
  readonly state: MatrixRowState;
  readonly contains?: Declared;
  readonly traces?: Declared;
  readonly others?: MatrixOthersCell;
}

/** Une ligne « Autres » sans rien dedans — ce que rend une fiche déclarée. */
const NO_OTHERS: MatrixOthersCell = { presence: "absent", contains: [], traces: [] };

/**
 * Comme `judgeDeclaration` : une fiche jamais déclarée n'a AUCUNE case (une
 * case vide se lirait « absent ») ; toute autre a ses quatorze cases et son
 * « Autres ».
 */
function rowOf(product: SpecimenProduct): MatrixRow {
  const declared = product.state !== "not_declared";
  return {
    productId: `specimen-${product.sku}`,
    variantId: `specimen-${product.sku}-v1`,
    sku: product.sku,
    productName: product.name,
    variantName: null,
    state: product.state,
    cells: declared ? COLUMNS.map((col) => cellOf(col.category, product)) : [],
    others: declared ? (product.others ?? NO_OTHERS) : null,
  };
}

function cellOf(category: IncoCategory, product: SpecimenProduct): MatrixCell {
  const contains = product.contains?.[category];
  const traces = product.traces?.[category];
  return {
    category,
    presence: contains !== undefined ? "contains" : traces !== undefined ? "traces" : "absent",
    contains: contains ?? [],
    traces: traces ?? [],
  };
}

const VIENNOISERIES: readonly SpecimenProduct[] = [
  {
    sku: "EXEMPLE-CRO",
    name: "EXEMPLE — Croissant pur beurre",
    state: "declared",
    contains: { gluten: ["Blé"], milk: [], eggs: [] },
    traces: { tree_nuts: ["Amandes"], sesame: [] },
  },
  {
    sku: "EXEMPLE-AMA",
    name: "EXEMPLE — Croissant aux amandes",
    state: "declared",
    contains: { gluten: ["Blé"], milk: [], eggs: [], tree_nuts: ["Amandes"] },
    traces: { tree_nuts: ["Noisettes"] },
  },
  {
    sku: "EXEMPLE-CHO",
    name: "EXEMPLE — Chausson du jour",
    state: "to_review",
    contains: { gluten: ["Blé"], milk: [] },
  },
];

const PAINS: readonly SpecimenProduct[] = [
  {
    sku: "EXEMPLE-BAG",
    name: "EXEMPLE — Baguette tradition",
    state: "declared",
    contains: { gluten: ["Blé"] },
    traces: { sesame: [], soybeans: [] },
  },
  {
    sku: "EXEMPLE-SAR",
    name: "EXEMPLE — Pain au sarrasin",
    state: "declared",
    contains: { gluten: ["Seigle"] },
    others: {
      presence: "contains",
      contains: [{ code: "BWD", label: "Sarrasin", official: true }],
      traces: [],
    },
  },
  { sku: "EXEMPLE-EAU", name: "EXEMPLE — Eau minérale", state: "none_declared" },
  { sku: "EXEMPLE-NEU", name: "EXEMPLE — Pain du mois", state: "not_declared" },
];

const SPECIMEN_FILTERS: MatrixFilters = {
  locale: "fr",
  scope: "published",
  categoryId: null,
  includeUndeclared: true,
};

const SPECIMEN_MATRIX: AllergenMatrix = {
  columns: COLUMNS,
  families: [
    { id: "specimen-family-1", name: "EXEMPLE — Viennoiseries", rows: VIENNOISERIES.map(rowOf) },
    { id: "specimen-family-2", name: "EXEMPLE — Pains", rows: PAINS.map(rowOf) },
  ],
  mentionsTranslated: true,
};

/** La matrice d'exemple, imprimée à `now` — les fiches « modifiées » au même instant. */
export function specimenAllergenMatrixPaper(now: Date): AllergenMatrixPaper {
  return {
    matrix: SPECIMEN_MATRIX,
    filters: SPECIMEN_FILTERS,
    familyName: null,
    generatedAt: now,
    lastModifiedAt: now,
  };
}
