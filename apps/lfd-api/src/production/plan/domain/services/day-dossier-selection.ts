import type { ProductionOrderSnapshot } from "../../../day/index.js";
import type { DossierRecapGroup } from "./day-dossier.js";
import { DossierSelectionUnknownError } from "../errors/dossier-selection-errors.js";

/**
 * **Une partie du dossier** — ce que la fenêtre d'impression coche. Chaque
 * partie se dessine avec la fonction du dossier complet : choisir n'est pas
 * redessiner.
 *
 * - `cover` : la couverture ;
 * - `recap` : le total à produire d'un rayon (ou d'un poste) ;
 * - `calendar` : sa page « par tranche horaire » ;
 * - `orders` : la fiche de chaque commande ;
 * - `deliveryNotes` : le BL de transport derrière elle ;
 * - `resupplies` : la fiche de chaque réassort.
 */
export type DossierPart = (typeof DOSSIER_PARTS)[number];

/** Toutes les parties, dans l'ordre du papier. */
export const DOSSIER_PARTS = [
  "cover",
  "recap",
  "calendar",
  "orders",
  "deliveryNotes",
  "resupplies",
] as const;

/**
 * **Ce qu'on tire du dossier.** `groups` nomme des rayons ou des postes par
 * leur libellé — c'est la clé que la page « par tranche horaire » partage
 * avec son total ; `orders` nomme des commandes par leur identifiant.
 */
export interface DossierSelection {
  readonly parts: ReadonlySet<DossierPart>;
  readonly groups: ReadonlySet<string> | "all";
  readonly orders: ReadonlySet<string> | "all";
}

/** Le dossier entier : le papier de l'arrêt, celui qu'on archive. */
export const WHOLE_DOSSIER: DossierSelection = {
  parts: new Set(DOSSIER_PARTS),
  groups: "all",
  orders: "all",
};

/** Vrai quand la sélection rend le dossier entier — et donc le papier archivable. */
export function isWholeDossier(selection: DossierSelection): boolean {
  return (
    DOSSIER_PARTS.every((part) => selection.parts.has(part)) &&
    selection.groups === "all" &&
    selection.orders === "all"
  );
}

/**
 * Les commandes choisies, filtrées **avant** le montage : la couverture et
 * les totaux comptent alors la sélection, jamais le jour entier présenté
 * comme tel.
 *
 * @throws {DossierSelectionUnknownError} une commande demandée n'est pas dans
 * la journée — l'imprimer en silence sans elle laisserait croire qu'elle y est.
 */
export function selectedOrders(
  orders: readonly ProductionOrderSnapshot[],
  selection: DossierSelection,
): readonly ProductionOrderSnapshot[] {
  const wanted = selection.orders;
  if (wanted === "all") {
    return orders;
  }
  const known = new Set(orders.map((order) => order.orderId));
  const missing = [...wanted].filter((orderId) => !known.has(orderId));
  if (missing.length > 0) {
    throw new DossierSelectionUnknownError("commande", missing);
  }
  return orders.filter((order) => wanted.has(order.orderId));
}

/**
 * Les rayons ou postes choisis, filtrés **après** le montage : un rayon garde
 * ses totaux, seules les pages des autres disparaissent.
 *
 * @throws {DossierSelectionUnknownError} un rayon demandé n'est pas au dossier.
 */
export function selectedRecap(
  recap: readonly DossierRecapGroup[],
  selection: DossierSelection,
): readonly DossierRecapGroup[] {
  const wanted = selection.groups;
  if (wanted === "all") {
    return recap;
  }
  const known = new Set(recap.map((group) => group.label));
  const missing = [...wanted].filter((label) => !known.has(label));
  if (missing.length > 0) {
    throw new DossierSelectionUnknownError("rayon ou poste", missing);
  }
  return recap.filter((group) => wanted.has(group.label));
}

/**
 * La mention d'en-tête d'un tirage partiel en commandes (« sélection : 3
 * commandes sur 14 »), `null` quand toutes y sont : un total d'une sélection
 * ne doit jamais se lire comme celui du jour.
 */
export function selectionNotice(selected: number, ofDay: number): string | null {
  if (selected === ofDay) {
    return null;
  }
  const word = selected > 1 ? "commandes" : "commande";
  return `sélection : ${String(selected)} ${word} sur ${String(ofDay)}`;
}
