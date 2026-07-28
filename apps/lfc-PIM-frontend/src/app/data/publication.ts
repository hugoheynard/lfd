import { generateFiches, type GeneratedFiche } from './channels';
import type { Category, Product, TvaRegime } from './models';

/**
 * La couche **publication** : ce que le catalogue FOLIE COFFEE **deviendrait** sur
 * Shopify (les fiches projetées), comparé à ce qu'on a **déjà publié**, pour en
 * tirer un plan — nouvelles / modifiées / à jour / à retirer — et un diff par
 * champ. Pur et déterministe : la page et le service ne font que l'afficher et
 * l'appliquer. Cf. [`documentation/lfc/projection-shopify.md`].
 */

/** Une déclinaison telle qu'elle part sur Shopify. */
export interface FicheVariant {
  sku: string;
  title: string;
}

/**
 * Une **fiche** projetée = `produit × mode`, l'unité qui devient un produit
 * Shopify. Porte le **SKU du produit** (partagé entre modes → réconciliation) et
 * l'empreinte de ce qui serait poussé.
 */
export interface ProjectedFiche extends GeneratedFiche {
  productId: string;
  /** SKU du produit — **le même** sur la fiche emporter et sur place. */
  sku: string;
  variants: FicheVariant[];
}

export type PublicationStatus =
  | 'new'
  | 'drifted'
  | 'up-to-date'
  | 'to-remove';

/** Un champ qui a changé entre la fiche publiée et la fiche projetée. */
export interface FieldDiff {
  field: string;
  before: string;
  after: string;
}

export interface PlanEntry {
  handle: string;
  /** La fiche courante ; pour `to-remove`, la fiche publiée qui disparaît. */
  fiche: ProjectedFiche;
  status: PublicationStatus;
  /** Renseigné seulement quand `status === 'drifted'`. */
  diffs: FieldDiff[];
}

export interface PublicationPlan {
  entries: PlanEntry[];
  counts: Record<PublicationStatus, number>;
}

/** Enrichit les fiches d'un produit avec son id, son SKU partagé et ses déclinaisons. */
function projectProductFiches(
  product: Product,
  category: Category,
  regimeById: ReadonlyMap<string, TvaRegime>,
): ProjectedFiche[] {
  const variants: FicheVariant[] = product.variants
    .filter((v) => !v.isDiscontinued)
    .map((v) => ({ sku: v.sku, title: v.name.fr }))
    .sort((a, b) => a.sku.localeCompare(b.sku));

  return generateFiches(product, category, regimeById).map((fiche) => ({
    ...fiche,
    productId: product.id,
    sku: product.sku,
    variants,
  }));
}

/** Toutes les fiches que le catalogue actif projetterait, indexées par handle. */
export function buildProjection(
  products: readonly Product[],
  categories: readonly Category[],
  regimes: readonly TvaRegime[],
): Map<string, ProjectedFiche> {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const regimeById = new Map(regimes.map((r) => [r.id, r]));

  const byHandle = new Map<string, ProjectedFiche>();
  for (const product of products) {
    if (product.status === 'archived') {
      continue;
    }
    const category = categoryById.get(product.categoryId);
    if (category === undefined) {
      continue;
    }
    for (const fiche of projectProductFiches(product, category, regimeById)) {
      byHandle.set(fiche.handle, fiche);
    }
  }
  return byHandle;
}

/** Les champs comparés pour décider « modifiée » et lister le diff. */
function fieldsOf(f: ProjectedFiche): Record<string, string> {
  return {
    Titre: f.title,
    'TVA': `${f.tvaTag} · ${f.tvaRate}`,
    Boutiques: f.boutiques.join(', ') || '—',
    Déclinaisons: f.variants.map((v) => `${v.sku} — ${v.title}`).join(' · '),
  };
}

/** Diff champ à champ entre la fiche publiée et la fiche projetée. */
export function diffFiche(
  published: ProjectedFiche,
  current: ProjectedFiche,
): FieldDiff[] {
  const before = fieldsOf(published);
  const after = fieldsOf(current);
  const diffs: FieldDiff[] = [];
  for (const field of Object.keys(after)) {
    const a = after[field] ?? '—';
    const b = before[field] ?? '—';
    if (a !== b) {
      diffs.push({ field, before: b, after: a });
    }
  }
  return diffs;
}

function emptyCounts(): Record<PublicationStatus, number> {
  return { new: 0, drifted: 0, 'up-to-date': 0, 'to-remove': 0 };
}

/**
 * Le plan de publication : rapproche la projection courante de ce qui a été
 * publié. Une fiche publiée absente de la projection courante = **à retirer**.
 */
export function planPublication(
  current: ReadonlyMap<string, ProjectedFiche>,
  published: Readonly<Record<string, ProjectedFiche>>,
): PublicationPlan {
  const entries: PlanEntry[] = [];
  const counts = emptyCounts();

  for (const [handle, fiche] of current) {
    const pub = published[handle];
    const diffs = pub ? diffFiche(pub, fiche) : [];
    const status: PublicationStatus = !pub
      ? 'new'
      : diffs.length === 0
        ? 'up-to-date'
        : 'drifted';
    entries.push({ handle, fiche, status, diffs });
    counts[status] += 1;
  }

  for (const [handle, fiche] of Object.entries(published)) {
    if (!current.has(handle)) {
      entries.push({ handle, fiche, status: 'to-remove', diffs: [] });
      counts['to-remove'] += 1;
    }
  }

  return { entries: sortEntries(entries), counts };
}

/** Ordre d'affichage : d'abord ce qui demande une action, « à jour » en dernier. */
const STATUS_ORDER: Record<PublicationStatus, number> = {
  'to-remove': 0,
  drifted: 1,
  new: 2,
  'up-to-date': 3,
};

function sortEntries(entries: PlanEntry[]): PlanEntry[] {
  return [...entries].sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    return byStatus !== 0 ? byStatus : a.handle.localeCompare(b.handle);
  });
}
