import type { BillingAddressPayload, DeliveryContact, GpsPoint } from "./address.js";
import type { DeparturePointView } from "./delivery-settings.js";
import type { FulfillmentSource } from "./order.js";

/**
 * **« Ma tournée » — ce que voit le livreur** (`documentation/livraisons/plan-ma-tournee.md`,
 * MT-D4, MT-D5 v2).
 *
 * Routes (`admin/livraison/ma-tournee…`, sous `delivery_driving`) :
 * - `GET ?date=AAAA-MM-JJ` → {@link MyDeliveryRoundsView} ;
 * - `GET /:roundId` → {@link MyDeliveryRoundView} ;
 * - `POST /:roundId/depart` (corps `DepartDeliveryRoundPayload`) → 204.
 *
 * Le mur est dans la requête : seules les tournées où la personne qui appelle
 * est le livreur AFFECTÉ existent pour elle — une autre rend 404, la liste et
 * le détail lisent le même `where`.
 *
 * 🔴 **Une liste blanche, et aucun montant.** Ni prix, ni total, ni ligne de
 * commande : un total servi au livreur serait lu comme une somme à encaisser
 * à la porte. Ajouter un champ ici est une décision, pas une commodité.
 */
export interface MyDeliveryRoundsView {
  /** Le jour demandé, `AAAA-MM-JJ`. */
  readonly date: string;
  /** Mes tournées ce jour-là, par véhicule puis par passage. */
  readonly rounds: readonly MyDeliveryRoundSummaryView[];
}

/** Une de mes tournées, résumée. */
export interface MyDeliveryRoundSummaryView {
  readonly id: string;
  readonly vehicleName: string;
  readonly passage: number;
  /** Partie le, ou `null` : au dépôt. */
  readonly departedAt: string | null;
  /** Ses arrêts (non retirés). */
  readonly stopCount: number;
}

/**
 * D'où vient l'ordre et le point des arrêts :
 * - `live` — au dépôt : l'ordre de la composition, le point du carnet ;
 * - `departure` — figés au départ (rang et point GPS de l'instantané) ;
 * - `not_frozen` — partie AVANT que le départ ne fige rang et point : l'ordre
 *   est celui de la composition et le point celui du carnet, et l'écran le dit
 *   (« ordre et position non figés au départ »).
 */
export type MyDeliveryRoundFreeze = "live" | "departure" | "not_frozen";

/** Ma tournée, arrêt par arrêt. */
export interface MyDeliveryRoundView {
  readonly id: string;
  readonly serviceDay: string;
  readonly vehicleName: string;
  readonly passage: number;
  /** À renvoyer avec « Commencer ma tournée » : une tournée modifiée entre-temps est refusée. */
  readonly version: number;
  readonly departedAt: string | null;
  readonly freeze: MyDeliveryRoundFreeze;
  /** Dans l'ordre de passage. */
  readonly stops: readonly MyDeliveryStopView[];
  /** Le point de départ des tournées, pour « Rentrer » ; `null` s'il n'en existe aucun. */
  readonly home: DeparturePointView | null;
}

/** Un arrêt, tel que le livreur en a besoin à la porte. */
export interface MyDeliveryStopView {
  readonly stopId: string;
  /** 1..n, dans l'ordre de passage. */
  readonly rank: number;
  readonly reference: string;
  /** La raison sociale, ou le nom de qui a commandé. */
  readonly customerLabel: string;
  readonly address: BillingAddressPayload | null;
  readonly window: MyDeliveryWindowView | null;
  readonly contact: DeliveryContact | null;
  readonly signatureRequired: boolean;
  /** La note laissée sur la commande par le client. `""` sans note. */
  readonly orderNote: string;
  /** La note livreurs de l'adresse du carnet, ou `null`. */
  readonly addressNote: string | null;
  /** Le point où aller ; `null` : naviguer par l'adresse en texte. */
  readonly gps: GpsPoint | null;
  /** La procédure de l'adresse, lue VIVANTE (une consigne corrigée atteint le livreur). */
  readonly procedure: readonly MyDeliveryStepView[];
  /** Les bacs non annulés de la commande. */
  readonly bins: number;
  /** Parmi eux, les bacs isothermes — « froid ». */
  readonly coldBins: number;
  /** Clos (livré ou raté, lot 6) le, ou `null` : à faire. Personne ne l'écrit encore. */
  readonly closedAt: string | null;
}

/** La fenêtre convenue ; `default` n'est pas une promesse faite au client. */
export interface MyDeliveryWindowView {
  readonly start: string | null;
  readonly end: string;
  readonly source: FulfillmentSource;
}

/** Une étape de procédure. */
export interface MyDeliveryStepView {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly hasPhoto: boolean;
  /** La révision de la photo, `null` sans photo. */
  readonly photoRevision: string | null;
}
