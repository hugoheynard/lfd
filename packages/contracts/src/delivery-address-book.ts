import type { DeliveryContact, GpsPoint } from "./address.js";

/**
 * **Une adresse de livraison du carnet, vue de Tour manager** — onglet
 * « Adresses » (demandé par Hugo le 2026-11-24) : toutes les adresses de
 * livraison des clients, avec leurs points et leurs consignes, en une table.
 *
 * Lecture seule. Les adresses archivées et celles d'une société supprimée
 * n'y figurent pas.
 */
export interface DeliveryAddressBookRow {
  readonly addressId: string;
  readonly companyId: string;
  /** L'enseigne du client — chaîne vide quand elle n'est pas renseignée. */
  readonly tradeName: string;
  /** La raison sociale du client. */
  readonly legalName: string;
  /** Le libellé de l'adresse au carnet (« Boutique Bastille »). */
  readonly addressLabel: string;
  readonly ligne1: string;
  readonly ligne2: string;
  readonly codePostal: string;
  readonly ville: string;
  readonly pays: string;
  /** L'adresse de livraison par défaut de sa société. */
  readonly isDefault: boolean;
  /** La porte : le point GPS des consignes, ou `null`. */
  readonly door: GpsPoint | null;
  /** Le stationnement, ou `null`. */
  readonly parking: GpsPoint | null;
  /** La note aux livreurs — chaîne vide quand il n'y en a pas. */
  readonly note: string;
  /** Le contact sur place, ou `null`. */
  readonly deliveryContact: DeliveryContact | null;
  /** Le livreur peut déposer sans personne pour réceptionner. */
  readonly depositAllowed: boolean;
  /** `ask` · `deposit` · `bring_back`, ou `null` : le réglage global. */
  readonly doorstepRule: string | null;
  /** Temps sur place en minutes, ou `null` : le réglage global. */
  readonly stopMinutes: number | null;
  /** Une procédure de livraison (étapes photo) est rangée pour l'adresse. */
  readonly hasProcedure: boolean;
}

/** La réponse de `GET /admin/delivery/address-book`, triée client puis libellé. */
export interface DeliveryAddressBookView {
  readonly addresses: readonly DeliveryAddressBookRow[];
}
