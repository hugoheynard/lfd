import type { DeliveryContact, GpsPoint, PreferredDeadlines, PreferredSlots } from "./address.js";
import type { WindowMode } from "./delivery-availability.values.js";

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
  /**
   * La signature exigée à la remise, EFFECTIVE : celle de l'adresse quand elle
   * la redéfinit, sinon le socle de sa société.
   */
  readonly signatureRequired: boolean;
  /** D'où vient {@link signatureRequired} : l'adresse, ou le socle de la société. */
  readonly signatureSource: DeliveryAddressBookSignatureSource;
  /** Une procédure de livraison (étapes photo) est rangée pour l'adresse. */
  readonly hasProcedure: boolean;
  /**
   * Créneau ou échéance pour CETTE adresse ; `null` : elle suit le réglage
   * global de livraison.
   */
  readonly windowMode: WindowMode | null;
  /** Ses créneaux préférés (lus en mode créneau) ; « aucun » = liste vide. */
  readonly slots: PreferredSlots;
  /** Ses échéances préférées (lues en mode échéance), ou `null` : aucune. */
  readonly deadlines: PreferredDeadlines | null;
}

/** L'origine de la signature effective d'une adresse du carnet. */
export type DeliveryAddressBookSignatureSource = "address" | "company";

/** La réponse de `GET /admin/delivery/address-book`, triée client puis libellé. */
export interface DeliveryAddressBookView {
  readonly addresses: readonly DeliveryAddressBookRow[];
}

/** Une heure convenue, `HH:MM` ; `start` nul : « avant `end` » (une échéance). */
export interface DeliveryDayWindow {
  readonly start: string | null;
  readonly end: string;
}

/** L'adresse livrée telle que la commande l'a figée à la passation. */
export interface DeliveryDayShippedAddress {
  readonly label: string;
  readonly ligne1: string;
  readonly ligne2: string;
  readonly codePostal: string;
  readonly ville: string;
  readonly pays: string;
}

/**
 * **Une livraison du jour, vue du carnet d'adresses** — la vue « Aujourd'hui /
 * Demain » de Tour manager (demandée par Hugo le 2026-11-25) : quelle
 * adresse, pour quelle commande, à quelle heure. Ni montant, ni ligne.
 */
export interface DeliveryDayAddressOrder {
  readonly orderId: string;
  readonly reference: string;
  /** La raison sociale, ou le nom de qui a commandé. */
  readonly customerLabel: string;
  /** La société de la commande, ou `null` pour un particulier. */
  readonly companyId: string | null;
  /** L'adresse du carnet à laquelle la commande est reliée, ou `null`. */
  readonly addressId: string | null;
  /** L'adresse livrée, figée à la passation, ou `null`. */
  readonly address: DeliveryDayShippedAddress | null;
  /** L'heure convenue, ou `null` : aucune. */
  readonly window: DeliveryDayWindow | null;
}

/** La réponse de `GET /admin/delivery/address-book/day/:day`. */
export interface DeliveryDayAddressesView {
  /** Le jour lu, `AAAA-MM-JJ`. */
  readonly day: string;
  /** Les livraisons attendues ce jour-là, annulées exclues, sans ordre promis. */
  readonly orders: readonly DeliveryDayAddressOrder[];
}
