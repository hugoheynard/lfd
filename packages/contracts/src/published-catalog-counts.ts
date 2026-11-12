import type { CatalogItemAudience } from "./catalog-admin.js";
import type {
  PendingReviewView,
  PublishedCellCounts,
  PublishedCellState,
  PublishedEntryView,
  PublishedShelfView,
} from "./published-catalog.js";

/**
 * **Les comptes par rayon et la liste à valider** de la vue « Catalogue
 * publié » (`documentation/caching-usage/plan-catalogue-du-back-office.md`,
 * § 3.2).
 *
 * Les deux se calculent sur TOUT le catalogue. Le serveur les rend avec
 * l'écran ; après un geste, l'écran remplace les lignes touchées dans sa
 * copie et les recalcule ici. UNE arithmétique pour les deux lecteurs : deux
 * copies se sépareraient, et l'écran montrerait après un geste des comptes
 * que la relecture suivante démentirait.
 *
 * Pure et sans dépendance à l'exécution (ni zod) : le back-office l'importe par
 * le sous-chemin `@lfd/contracts/published-catalog-counts`, sans le baril.
 */

/** Une famille connue, telle qu'un rayon la montre. */
export interface PublishedShelfFamily {
  readonly categoryId: string;
  readonly name: string;
  readonly position: number;
  readonly withdrawn: boolean;
}

/** Ce que la liste à valider lit d'un article en vente. */
export interface PendingReviewCandidate {
  readonly sku: string;
  readonly productId: string;
  readonly productSku: string;
  readonly name: string;
  readonly categoryId: string;
  /** `null` = jamais reçue par un fait, lue `both`. */
  readonly audience: CatalogItemAudience | null;
  readonly proReviewPending: boolean;
  readonly publicReviewPending: boolean;
  readonly receivedAt: string;
}

type ReviewAudience = "pro" | "public";

const REVIEW_AUDIENCES: readonly ReviewAudience[] = ["pro", "public"];

/** Rang d'une famille que la plateforme ne connaît pas : après toutes les autres. */
const UNKNOWN_SHELF_POSITION = Number.MAX_SAFE_INTEGER;

/**
 * Les rayons : toutes les familles connues, dans l'ordre reçu, puis celles
 * qu'une fiche cite sans être connues (`name: null`). Chaque rayon compte ses
 * déclinaisons par état, pour les pros et pour le public.
 */
export function publishedShelvesOf(
  families: readonly PublishedShelfFamily[],
  entries: readonly PublishedEntryView[],
): PublishedShelfView[] {
  const byShelf = new Map<string, PublishedEntryView[]>();
  for (const entry of entries) {
    const group = byShelf.get(entry.categoryId);
    if (group === undefined) {
      byShelf.set(entry.categoryId, [entry]);
    } else {
      group.push(entry);
    }
  }
  const known = families.map((family) => shelfOf(family, byShelf.get(family.categoryId) ?? []));
  const knownIds = new Set(families.map((family) => family.categoryId));
  const unknown = [...byShelf.entries()]
    .filter(([categoryId]) => !knownIds.has(categoryId))
    .map(([categoryId, shelfEntries]) =>
      shelfOf(
        { categoryId, name: null, position: UNKNOWN_SHELF_POSITION, withdrawn: false },
        shelfEntries,
      ),
    );
  return [...known, ...unknown];
}

/**
 * Les articles qui attendent une validation, et pour qui : une audience n'y
 * figure que si l'article l'attend ET que son audience la contient. Dans
 * l'ordre des articles reçus.
 */
export function pendingReviewOf(items: readonly PendingReviewCandidate[]): PendingReviewView[] {
  return items.flatMap((item) => {
    const audiences = REVIEW_AUDIENCES.filter(
      (audience) => pendingFor(item, audience) && audienceIncludes(item.audience, audience),
    );
    return audiences.length === 0
      ? []
      : [
          {
            sku: item.sku,
            productId: item.productId,
            productSku: item.productSku,
            name: item.name,
            categoryId: item.categoryId,
            audiences,
            receivedAt: item.receivedAt,
          },
        ];
  });
}

function shelfOf(
  family: Omit<PublishedShelfFamily, "name"> & { readonly name: string | null },
  entries: readonly PublishedEntryView[],
): PublishedShelfView {
  const variants = entries.flatMap((entry) => entry.variants);
  return {
    categoryId: family.categoryId,
    name: family.name,
    position: family.position,
    withdrawn: family.withdrawn,
    pro: countsOf(variants.map((variant) => variant.pro.state)),
    public: countsOf(variants.map((variant) => variant.public.state)),
  };
}

function countsOf(states: readonly PublishedCellState[]): PublishedCellCounts {
  const counts: Record<PublishedCellState, number> = {
    inactif: 0,
    en_vente: 0,
    masque: 0,
    pas_vendu: 0,
    en_attente_validation: 0,
    incomplet: 0,
  };
  for (const state of states) {
    counts[state] += 1;
  }
  return counts;
}

function pendingFor(item: PendingReviewCandidate, audience: ReviewAudience): boolean {
  return audience === "pro" ? item.proReviewPending : item.publicReviewPending;
}

function audienceIncludes(audience: CatalogItemAudience | null, viewer: ReviewAudience): boolean {
  const effective = audience ?? "both";
  return effective === "both" || effective === viewer;
}
