import {
  SHELF_LABEL_OFF_CATALOG,
  SHELF_LABEL_UNKNOWN,
  UNPLACED_GROUP_SUFFIX,
  UNSHELVED_WORKSHOP_GROUP_KEY,
  WORKSTATION_GROUP_KEY_PREFIX,
  type CatalogFamilyNodeView,
  type CatalogFamilyView,
  type WorkshopGroupKind,
} from "@lfd/contracts";

import { rootShelvesOf, type ShelfSection } from "./root-shelves.js";

/**
 * **Le rangement du fournil, dans ses deux modes** (plan
 * `documentation/fournil/les-postes-du-fournil.md`, § 3.4).
 *
 * Une fonction pure, que la fiche d'atelier et le dossier du jour traduisent
 * chacun dans leur forme. Elle ne lit rien : l'appelant lui passe les rayons
 * (mode boutique) ou les articles et les postes (mode prod). L'imprimerie ne
 * connaît donc ni le commerce ni les postes, seulement leurs réponses.
 *
 * - **Mode boutique** : exactement `rootShelvesOf` — un groupe par rayon
 *   racine, puis « Hors catalogue » (ou « Rayon inconnu » si les rayons n'ont
 *   pas pu être lus).
 * - **Mode prod** : un groupe par poste qui a des lignes, dans l'ordre des
 *   postes ; puis, pour les produits sans poste, un groupe par rayon titré
 *   « … — à ranger » ; puis « Hors catalogue — à ranger » pour un SKU absent
 *   du miroir du catalogue, qui n'a pas de produit et ne peut donc pas
 *   recevoir de poste.
 *
 * Dans les deux modes, le rayon ne dépend pas de l'état de vente (décidé par
 * Hugo le 2026-11-17) : un article masqué, réservé à une clientèle, sans taux
 * ou retiré se range sous son vrai rayon. « Hors catalogue » ne vaut que pour
 * un SKU absent du miroir.
 *
 * Toute ligne reçue ressort dans exactement un groupe, dans les deux modes.
 * Aucun groupe vide.
 */

/** Un poste en service, dans l'ordre des fiches. */
export interface GroupingWorkstation {
  readonly id: string;
  readonly name: string;
}

/** Ce que le mode prod sait d'un SKU : son produit et son rayon de boutique. */
export interface GroupingArticle {
  readonly productSku: string;
  readonly family: CatalogFamilyView;
}

/** Ce que l'appelant a lu pour ranger en mode prod. */
export interface GroupingPlacement {
  /** Les postes en service, dans l'ordre des fiches. */
  readonly workstations: readonly GroupingWorkstation[];
  /** SKU → son article ; un SKU absent est hors catalogue. */
  readonly articles: ReadonlyMap<string, GroupingArticle>;
  /** Référence produit → id de son poste ; un produit absent n'a pas de poste. */
  readonly byProduct: ReadonlyMap<string, string>;
}

/** Ce que le rangement reçoit : le mode, et ce qui a été lu pour lui. */
export type GroupingSource =
  | {
      readonly mode: "shelf";
      /** `null` : la lecture des rayons a échoué. */
      readonly shelves: ReadonlyMap<string, CatalogFamilyView> | null;
    }
  | { readonly mode: "workstation"; readonly placement: GroupingPlacement };

/** Un groupe neutre, que chaque papier traduit dans sa forme. */
export interface ProductionGroup<T> {
  /** L'id du rayon racine, `ws:<id>` pour un poste, ou `UNSHELVED_WORKSHOP_GROUP_KEY`. */
  readonly key: string;
  readonly title: string;
  readonly kind: WorkshopGroupKind;
  /** Le poste d'un groupe `workstation` ; `null` ailleurs. */
  readonly workstation: GroupingWorkstation | null;
  /** Le rayon racine d'un groupe `shelf` ou `unplaced` ; `null` ailleurs. */
  readonly shelf: CatalogFamilyNodeView | null;
  /** `true` : en mode prod, ces lignes n'ont pas de poste. */
  readonly unplaced: boolean;
  /**
   * Ses intertitres, dans l'ordre : les sous-catégories d'un rayon, ou les
   * rayons de boutique d'où viennent les lignes d'un poste. Vide pour le
   * groupe sans rayon. L'appelant ne les pose que si le réglage les affiche.
   */
  readonly sections: readonly ShelfSection<T>[];
  /** Ses lignes, dans l'ordre reçu. */
  readonly lines: readonly T[];
}

/** Range les lignes selon le mode. */
export function groupingOf<T>(
  lines: readonly T[],
  skuOf: (line: T) => string,
  source: GroupingSource,
): readonly ProductionGroup<T>[] {
  return source.mode === "shelf"
    ? shelfGroupsOf(lines, skuOf, source.shelves)
    : workstationGroupsOf(lines, skuOf, source.placement);
}

function shelfGroupsOf<T>(
  lines: readonly T[],
  skuOf: (line: T) => string,
  shelves: ReadonlyMap<string, CatalogFamilyView> | null,
): readonly ProductionGroup<T>[] {
  const label = shelves === null ? SHELF_LABEL_UNKNOWN : SHELF_LABEL_OFF_CATALOG;
  return shelvedGroupsOf(lines, (line) => shelves?.get(skuOf(line)), false, label);
}

/**
 * Les rayons, puis le groupe sans rayon. `unplaced` titre chaque rayon
 * « … — à ranger » et le marque `unplaced`.
 */
function shelvedGroupsOf<T>(
  lines: readonly T[],
  familyOf: (line: T) => CatalogFamilyView | undefined,
  unplaced: boolean,
  unshelvedTitle: string,
): readonly ProductionGroup<T>[] {
  const shelving = rootShelvesOf(lines, familyOf);
  const groups: ProductionGroup<T>[] = shelving.shelves.map((shelf) => ({
    key: shelf.root.id,
    title: unplaced ? `${shelf.root.name}${UNPLACED_GROUP_SUFFIX}` : shelf.root.name,
    kind: unplaced ? "unplaced" : "shelf",
    workstation: null,
    shelf: shelf.root,
    unplaced,
    sections: shelf.sections,
    lines: shelf.items,
  }));
  if (shelving.unshelved.length > 0) {
    groups.push(offCatalogGroupOf(shelving.unshelved, unshelvedTitle, unplaced));
  }
  return groups;
}

function offCatalogGroupOf<T>(
  lines: readonly T[],
  title: string,
  unplaced: boolean,
): ProductionGroup<T> {
  return {
    key: UNSHELVED_WORKSHOP_GROUP_KEY,
    title,
    kind: "off_catalog",
    workstation: null,
    shelf: null,
    unplaced,
    sections: [],
    lines,
  };
}

function workstationGroupsOf<T>(
  lines: readonly T[],
  skuOf: (line: T) => string,
  placement: GroupingPlacement,
): readonly ProductionGroup<T>[] {
  const known = new Set(placement.workstations.map((workstation) => workstation.id));
  const byWorkstation = new Map<string, T[]>();
  const withoutWorkstation: T[] = [];
  const offCatalog: T[] = [];
  for (const line of lines) {
    const article = placement.articles.get(skuOf(line));
    if (article === undefined) {
      offCatalog.push(line);
      continue;
    }
    const workstationId = placement.byProduct.get(article.productSku);
    // Un poste hors de la liste ne peut être qu'archivé, ce que la carte
    // refuse tant qu'il porte des produits : la ligne reste « à ranger ».
    if (workstationId === undefined || !known.has(workstationId)) {
      withoutWorkstation.push(line);
      continue;
    }
    const bucket = byWorkstation.get(workstationId) ?? [];
    byWorkstation.set(workstationId, bucket);
    bucket.push(line);
  }
  const familyOf = (line: T): CatalogFamilyView | undefined =>
    placement.articles.get(skuOf(line))?.family;
  const stations = placement.workstations.flatMap((workstation) => {
    const items = byWorkstation.get(workstation.id);
    return items === undefined ? [] : [stationGroupOf(workstation, items)];
  });
  // Une ligne sans poste a un article, donc un rayon : rien n'y reste sans rayon.
  const shelved = shelvedGroupsOf(withoutWorkstation, familyOf, true, offCatalogTitle());
  const tail =
    offCatalog.length === 0 ? [] : [offCatalogGroupOf(offCatalog, offCatalogTitle(), true)];
  return [...stations, ...shelved, ...tail];
}

function offCatalogTitle(): string {
  return `${SHELF_LABEL_OFF_CATALOG}${UNPLACED_GROUP_SUFFIX}`;
}

/**
 * Une fiche de poste, **sans intertitre** : une seule section, la racine
 * elle-même (`family: null`), dont les lignes gardent l'ordre de la fiche.
 * Un poste parle la langue du fournil ; y remettre les rayons de la boutique
 * en intertitres, c'est ce que le rangement par poste veut quitter (décidé
 * par Hugo le 2026-11-17). « Afficher les sous-catégories » ne vaut donc
 * qu'en mode boutique.
 */
function stationGroupOf<T>(
  workstation: GroupingWorkstation,
  lines: readonly T[],
): ProductionGroup<T> {
  const sections: readonly ShelfSection<T>[] = [{ family: null, items: lines }];
  return {
    key: `${WORKSTATION_GROUP_KEY_PREFIX}${workstation.id}`,
    title: workstation.name,
    kind: "workstation",
    workstation: { id: workstation.id, name: workstation.name },
    shelf: null,
    unplaced: false,
    sections,
    lines,
  };
}
