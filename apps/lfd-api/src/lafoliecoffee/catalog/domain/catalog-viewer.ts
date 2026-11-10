import {
  holderIds,
  type ReservationHolders,
} from "../../shared/company-standing/domain/reservation-holders.js";
import type { ShopAudience } from "./ports/catalog.reader.js";

/**
 * **Qui lit le catalogue** (`documentation/catalogue/plan-articles-sur-mesure.md`,
 * § 5) — ce que le port reçoit à la place d'une simple audience.
 *
 * Un type somme pour qu'un appelant qui oublie la société ne compile plus :
 * avec l'audience seule, `"pro"` sans société valait « tous les pros », donc
 * les articles réservés à n'importe qui.
 *
 * - `public` : un particulier. Jamais un article réservé ni sur mesure (S3).
 * - `pro_anonymous` : le rayon pro sans connexion. Jamais un article réservé,
 *   même `visible_locked` (Q2).
 * - `pro` : un pro reconnu pour une société. `show` vaut `served_and_locked`
 *   pour les seuls lecteurs qui montrent un article verrouillé — le rayon
 *   reconnu, les habituels, et le chemin qui facture pour le refuser par son
 *   nom (S7) ; tout autre lecteur reçoit `locked` comme absent.
 * - `staff` : le personnel voit tout ce que l'audience lue sert, réservations
 *   comprises, étiquetées pour `regarding` (S5). Jamais derrière une route qui
 *   rend un article à un client (§ 6).
 */
export type CatalogViewer =
  | { readonly kind: "public" }
  | { readonly kind: "pro_anonymous" }
  | ProCatalogViewer
  | StaffCatalogViewer;

/** Ce qu'un lecteur pro reconnu reçoit d'un article verrouillé (S7). */
export type ProCatalogShow = "served" | "served_and_locked";

export interface ProCatalogViewer {
  readonly kind: "pro";
  readonly holders: ReservationHolders;
  readonly show: ProCatalogShow;
  /**
   * Les lignes GARDÉES d'une révision : un article déjà commandé par cette
   * commande reste lu même si sa réservation a changé depuis (§ 5, Q4). Seul
   * `OrderLinePricing.minimumsOf` le construit, par {@link keptLinesViewer}.
   */
  readonly waiveReservation?: true;
}

export interface StaffCatalogViewer {
  readonly kind: "staff";
  /**
   * L'audience dont on lit le prix et la gamme — le personnel lit tantôt le
   * tarif pro, tantôt l'étiquette publique. Le plan ne nommait pas ce champ :
   * sans lui, une lecture staff n'aurait pas de prix d'entrée.
   */
  readonly audience: ShopAudience;
  /**
   * Le compte au nom duquel l'écran étiquette « réservé à ce compte » / « à
   * un autre compte » (fiche client). Porté avec son principal : un article
   * réservé au principal est « à ce compte » pour ses sites (Q3).
   */
  readonly regarding: ReservationHolders | null;
}

export const PUBLIC_VIEWER: CatalogViewer = { kind: "public" };
export const PRO_ANONYMOUS_VIEWER: CatalogViewer = { kind: "pro_anonymous" };

/** Le personnel, à cette audience, sans compte regardé. */
export function staffViewer(
  audience: ShopAudience,
  regarding: ReservationHolders | null = null,
): StaffCatalogViewer {
  return { kind: "staff", audience, regarding };
}

/** Un pro reconnu pour cette société. */
export function proViewer(
  holders: ReservationHolders,
  show: ProCatalogShow = "served",
): ProCatalogViewer {
  return { kind: "pro", holders, show };
}

/** Le lecteur des lignes gardées d'une révision (§ 5) — `minimumsOf` seulement. */
export function keptLinesViewer(holders: ReservationHolders): ProCatalogViewer {
  return { kind: "pro", holders, show: "served", waiveReservation: true };
}

/** Un visiteur sans société : le public, ou le pro anonyme. */
export function anonymousViewer(audience: ShopAudience): CatalogViewer {
  return audience === "public" ? PUBLIC_VIEWER : PRO_ANONYMOUS_VIEWER;
}

/** L'audience dont ce lecteur lit le prix et la gamme. */
export function viewerAudience(viewer: CatalogViewer): ShopAudience {
  if (viewer.kind === "staff") {
    return viewer.audience;
  }
  return viewer.kind === "public" ? "public" : "pro";
}

/** Les sociétés dont une réservation compte pour ce lecteur — vide sans société. */
export function viewerHolderIds(viewer: CatalogViewer): readonly string[] {
  if (viewer.kind === "pro") {
    return holderIds(viewer.holders);
  }
  return viewer.kind === "staff" && viewer.regarding !== null ? holderIds(viewer.regarding) : [];
}

/**
 * **La société à passer au tarificateur** — celle du lecteur pro, `null`
 * sinon (`plan-pros-en-cours-d-inscription.md`, § 11, B2). Le tarificateur
 * charge mercuriale et tarif de canal PAR société, indépendamment du lecteur :
 * une société servie au public ne lui passe donc jamais son identifiant brut.
 */
export function pricingCompanyOf(viewer: CatalogViewer): string | null {
  return viewer.kind === "pro" ? viewer.holders.companyId : null;
}
