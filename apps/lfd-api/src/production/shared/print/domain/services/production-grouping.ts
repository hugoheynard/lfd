import {
  SHELF_LABEL_OFF_CATALOG,
  SHELF_LABEL_UNKNOWN,
  UNPLACED_GROUP_SUFFIX,
  UNSHELVED_WORKSHOP_GROUP_KEY,
  WORKSTATION_GROUP_KEY_PREFIX,
  type CatalogFamilyNodeView,
  type CatalogFamilyView,
  type WorkshopGroupKind,
  type WorkshopLineRole,
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
 *   postes, ses lignes dans la pile du poste (la place du produit de chaque
 *   ligne dans CE poste ; sans place, après, dans l'ordre reçu). Une ligne
 *   dont le produit a plusieurs postes ressort sous **chacun**, avec son rôle
 *   dans ce poste (`finishes` | `step`, `roles`) — plan
 *   `documentation/fournil/un-produit-sur-plusieurs-postes.md`, § 2.2 ;
 *   puis, pour les produits sans poste, un groupe par rayon titré
 *   « … — à ranger » ; puis « Hors catalogue — à ranger » pour un SKU absent
 *   du miroir du catalogue, qui n'a pas de produit et ne peut donc pas
 *   recevoir de poste.
 *
 * Dans les deux modes, le rayon ne dépend pas de l'état de vente (décidé par
 * Hugo le 2026-11-17) : un article masqué, réservé à une clientèle, sans taux
 * ou retiré se range sous son vrai rayon. « Hors catalogue » ne vaut que pour
 * un SKU absent du miroir.
 *
 * En mode boutique, toute ligne reçue ressort dans exactement un groupe ; en
 * mode prod, au moins un — une fois par poste de son produit. Une somme
 * GÉNÉRALE sur les groupes compterait donc deux fois une ligne à deux postes :
 * elle se fait sur les lignes, dédoublonnées par SKU, jamais sur les groupes.
 * Aucun groupe vide.
 */

/** Un poste en service, dans l'ordre des fiches. */
export interface GroupingWorkstation {
  readonly id: string;
  readonly name: string;
}

/** Un des postes d'un produit : s'il le finit, et la place du produit dans sa pile. */
export interface GroupingStation {
  readonly workstationId: string;
  readonly finishes: boolean;
  /** `null` : sans place réglée, le produit vient après ceux qui en ont une. */
  readonly position: number | null;
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
  /**
   * Référence produit → ses postes, chacun avec sa place dans sa pile ; un
   * produit absent (ou sans poste) n'a pas de poste.
   */
  readonly byProduct: ReadonlyMap<string, readonly GroupingStation[]>;
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
  /**
   * SKU → ce que le poste fait de la ligne. Rempli pour un groupe
   * `workstation` seulement ; vide ailleurs, où une ligne n'a pas de rôle.
   */
  readonly roles: ReadonlyMap<string, WorkshopLineRole>;
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
    roles: NO_ROLES,
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
    roles: NO_ROLES,
  };
}

const NO_ROLES: ReadonlyMap<string, WorkshopLineRole> = new Map();

/** Une ligne dans la pile d'un poste : sa place, et son rôle. */
interface StationEntry<T> {
  readonly line: T;
  readonly station: GroupingStation;
}

function workstationGroupsOf<T>(
  lines: readonly T[],
  skuOf: (line: T) => string,
  placement: GroupingPlacement,
): readonly ProductionGroup<T>[] {
  const known = new Set(placement.workstations.map((workstation) => workstation.id));
  const byWorkstation = new Map<string, StationEntry<T>[]>();
  const withoutWorkstation: T[] = [];
  const offCatalog: T[] = [];
  for (const line of lines) {
    const article = placement.articles.get(skuOf(line));
    if (article === undefined) {
      offCatalog.push(line);
      continue;
    }
    // Un poste hors de la liste ne peut être qu'archivé, ce que la carte
    // refuse tant qu'il porte des produits : sans poste connu, la ligne
    // reste « à ranger ».
    const stations = (placement.byProduct.get(article.productSku) ?? []).filter((station) =>
      known.has(station.workstationId),
    );
    if (stations.length === 0) {
      withoutWorkstation.push(line);
      continue;
    }
    for (const station of stations) {
      const bucket = byWorkstation.get(station.workstationId) ?? [];
      byWorkstation.set(station.workstationId, bucket);
      bucket.push({ line, station });
    }
  }
  const familyOf = (line: T): CatalogFamilyView | undefined =>
    placement.articles.get(skuOf(line))?.family;
  const groups = placement.workstations.flatMap((workstation) => {
    const entries = byWorkstation.get(workstation.id);
    return entries === undefined ? [] : [stationGroupOf(workstation, inPile(entries), skuOf)];
  });
  // Une ligne sans poste a un article, donc un rayon : rien n'y reste sans rayon.
  const shelved = shelvedGroupsOf(withoutWorkstation, familyOf, true, offCatalogTitle());
  const tail =
    offCatalog.length === 0 ? [] : [offCatalogGroupOf(offCatalog, offCatalogTitle(), true)];
  return [...groups, ...shelved, ...tail];
}

/**
 * Les lignes d'un poste dans sa pile : par place du produit de chaque ligne
 * DANS CE POSTE (une déclinaison suit son produit), les lignes sans place
 * après, et l'ordre reçu entre deux lignes de même rang — le tri est stable.
 */
function inPile<T>(entries: readonly StationEntry<T>[]): readonly StationEntry<T>[] {
  const rankOf = (entry: StationEntry<T>): number =>
    entry.station.position ?? Number.POSITIVE_INFINITY;
  return entries
    .map((entry, index) => ({ entry, index, rank: rankOf(entry) }))
    .sort((left, right) =>
      left.rank === right.rank ? left.index - right.index : left.rank - right.rank,
    )
    .map((ranked) => ranked.entry);
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
  entries: readonly StationEntry<T>[],
  skuOf: (line: T) => string,
): ProductionGroup<T> {
  const lines = entries.map((entry) => entry.line);
  const roles = new Map(
    entries.map(
      (entry) => [skuOf(entry.line), entry.station.finishes ? "finishes" : "step"] as const,
    ),
  );
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
    roles,
  };
}
