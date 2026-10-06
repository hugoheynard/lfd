import type { BillingAddressPayload, DeliveryContact, GpsPoint } from "./address.js";
import type { DeliveryIncidentView, DeliveryStopOrderState } from "./delivery-doorstep.js";
import type { DeparturePointView } from "./delivery-settings.js";
import type { StopDecisionView } from "./delivery-stop-decision.js";
import type { FulfillmentSource } from "./order.js";

/**
 * **« Ma tournée » — ce que voit le livreur** (`documentation/livraisons/plan-ma-tournee.md`,
 * MT-D4, MT-D5 v2).
 *
 * Routes (`admin/livraison/ma-tournee…`, sous `delivery_driving`) :
 * - `GET ?date=AAAA-MM-JJ` → {@link MyDeliveryRoundsView} ;
 * - `GET /:roundId` → {@link MyDeliveryRoundView} ;
 * - `POST /:roundId/depart` (corps `DepartDeliveryRoundPayload`) → 204 ;
 * - `POST /:roundId/retour` → 204, idempotente — « Tournée terminée » (PL2,
 *   sous `delivery_doorstep`) ;
 * - `GET /:roundId/arrets/:stopId/procedure/:stepId/photo` → l'image (octets,
 *   `Content-Type` relu dans les octets, `private, immutable`) — l'écran y
 *   ajoute `?rev=` + {@link MyDeliveryStepView.photoRevision} ;
 * - `GET /version?date=AAAA-MM-JJ` → `DayVersionView` — la version de « ma
 *   tournée » (PL4) : elle bouge quand le journal de la livraison OU celui du
 *   commerce bouge pour ce jour. Opaque, elle se compare par égalité ;
 * - le chargement de MA tournée (PL1, mêmes vues et mêmes corps que l'écran
 *   de chargement, `delivery-loading.ts`) : `GET /:roundId/chargement` →
 *   `DeliveryLoadingRoundView` ; `GET /:roundId/chargement/plan` →
 *   `DeliveryLoadingPlanView` ; `POST /:roundId/chargement/bacs`
 *   (`LoadDeliveryBinPayload`) → 204 ; `POST
 *   /:roundId/chargement/bacs/:binId/dechargement` → 204.
 *
 * Les gestes à la porte (arriver, signaler, clore sans remise) sont dans
 * `delivery-doorstep.ts`, sous `delivery_doorstep`.
 *
 * Le mur est dans la requête : seules les tournées où la personne qui appelle
 * est le livreur AFFECTÉ existent pour elle — une autre rend 404, la liste et
 * le détail lisent le même `where`.
 *
 * 🔴 **Une liste blanche, et aucun montant.** Ni prix, ni total : un total
 * servi au livreur serait lu comme une somme à encaisser à la porte. Ajouter
 * un champ ici est une décision, pas une commodité. Les produits de la
 * commande y sont entrés le 2026-10-01 par décision (« une seule fiche »,
 * `parcours-du-livreur.md`, PL4) — le contenu de la feuille d'atelier, SANS
 * montant, comme le papier qui voyage dans le bac.
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
  /**
   * Rentrée le — « Tournée terminée » (PL2). Rentrée, plus aucun geste à la
   * porte n'est accepté.
   */
  readonly returnedAt: string | null;
  readonly freeze: MyDeliveryRoundFreeze;
  /** Dans l'ordre de passage. */
  readonly stops: readonly MyDeliveryStopView[];
  /** Le point de départ des tournées, pour « Rentrer » ; `null` s'il n'en existe aucun. */
  readonly home: DeparturePointView | null;
  /** Les problèmes signalés sur cette tournée, du plus ancien au plus récent. */
  readonly incidents: readonly DeliveryIncidentView[];
  /** Les arrêts dont la commande est prête (`packing: "ready"`) — « 4 arrêts prêts sur 6 » (PL4). */
  readonly readyStops: number;
  /** Les arrêts de la tournée (non retirés). */
  readonly stopCount: number;
}

/**
 * Où en est le colisage d'une commande (PL4) :
 * - `in_progress` — en préparation ;
 * - `ready` — prête : la commande est `ready` (ou au-delà) côté commerce, qui
 *   l'apprend du fournil au scan de la fiche.
 */
export type MyDeliveryStopPacking = "in_progress" | "ready";

/**
 * Une ligne de la fiche d'un arrêt — le contenu de la feuille d'atelier
 * (PL4). **Aucun montant**, par construction : il n'y a pas de champ pour.
 *
 * ⚠️ Pas d'unité : ni la ligne de commande ni la feuille d'atelier n'en
 * portent (relevé le 2026-10-01) — la quantité se lit en pièces vendues.
 */
export interface MyDeliverySheetLineView {
  readonly sku: string;
  /** Le nom figé à la commande. */
  readonly name: string;
  readonly quantity: number;
  /** Le produit demande le froid (fiche du référentiel) ; `false` : rien de déclaré. */
  readonly requiresCold: boolean;
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
  /** Clos le, ou `null` : à faire. Écrit, au lot A, par la seule clôture sans remise. */
  readonly closedAt: string | null;
  /** « Je suis arrivé » le (ISO), ou `null` : aucune arrivée déclarée. */
  readonly arrivedAt: string | null;
  /**
   * Le client autorise le dépôt sans personne à cette adresse — FIGÉ au départ,
   * lu vivant au dépôt ; `false` sans adresse reliée au carnet (AP-D5).
   */
  readonly depositAllowed: boolean;
  /**
   * « Déposé avec preuve » est-il permis ? Calculé par le serveur : le dépôt
   * autorisé ET aucune signature exigée — la signature l'emporte (AP-Q6) —,
   * OU l'autorisation d'un commercial pour cet arrêt, qui l'emporte sur la
   * signature (B3, LB-Q5). L'écran ne refait pas la règle.
   */
  readonly canDeposit: boolean;
  /**
   * La décision du commercial sur cet arrêt (`a-la-porte.md`, B3), ou
   * `null` : aucun signalement n'en a ouvert. « Autorisé : déposer » ouvre
   * {@link canDeposit} même signature exigée (LB-Q5) ; « Rapporté » clôt
   * l'arrêt.
   */
  readonly decision: StopDecisionView | null;
  /**
   * Où en est la commande, lue vivante au commerce : une commande déjà
   * retirée ou annulée se clôt sans remise (AP-D2).
   */
  readonly orderState: DeliveryStopOrderState;
  /** La fiche : les produits de la commande, fusionnés par SKU, dans l'ordre de la commande. */
  readonly sheet: readonly MyDeliverySheetLineView[];
  /** L'avancement du colisage (PL4). */
  readonly packing: MyDeliveryStopPacking;
  /** Les bacs déclarés et non annulés — le même compte que {@link bins}, nommé pour l'avancement. */
  readonly binsDeclared: number;
  /**
   * Les bacs que la proposition de colisage prévoit (une moitié compte pour
   * un) — ABSENT quand elle ne sait pas le dire : un produit sans contenance,
   * ou du froid sans bac isotherme. Une proposition, pas une consigne : le
   * coliseur peut déclarer autrement.
   */
  readonly binsExpected?: number;
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
