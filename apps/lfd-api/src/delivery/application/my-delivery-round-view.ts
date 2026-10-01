import type {
  DeliveryStopOrderState,
  DeparturePointView,
  GpsPoint,
  MyDeliveryRoundFreeze,
  MyDeliveryRoundView,
  MyDeliverySheetLineView,
  MyDeliveryStepView,
  MyDeliveryStopView,
} from "@lfd/contracts";

import type { DeliveryProcedureStep } from "../channels/commerce/index.js";
import type { DepartureSheet } from "../domain/entities/departure-sheet.js";
import type { DeliveryIncidentRow } from "../domain/ports/delivery-incidents.reader.js";
import type { DriverRoundRow, DriverStopRow } from "../domain/ports/driver-rounds.reader.js";
import { depositPermitted } from "../domain/services/deposit-rule.js";
import { deliveryIncidentView } from "./delivery-incident-view.js";
import type { StopSheet } from "./stop-sheets.js";

/** Ce que la vue du livreur assemble — les lectures faites au même moment. */
export interface MyDeliveryRoundInputs {
  readonly round: DriverRoundRow;
  /** Les feuilles VIVANTES du commerce, pour les arrêts sans instantané (au dépôt). */
  readonly sheets: ReadonlyMap<string, DepartureSheet>;
  /** Le point du carnet, vivant, par commande. */
  readonly carnetPoints: ReadonlyMap<string, GpsPoint | null>;
  /** La procédure vivante, par commande. */
  readonly procedures: ReadonlyMap<string, readonly DeliveryProcedureStep[]>;
  /** Le point de départ des tournées, pour « Rentrer ». */
  readonly home: DeparturePointView | null;
  /** Où en est chaque commande, lu vivant au commerce ; une absente reste `open`. */
  readonly orderStates: ReadonlyMap<string, DeliveryStopOrderState>;
  /** Les signalements de la tournée, du plus ancien au plus récent. */
  readonly incidents: readonly DeliveryIncidentRow[];
  /** La fiche de chaque commande (PL4) ; une absente : fiche vide, rien d'attendu. */
  readonly stopSheets: ReadonlyMap<string, StopSheet>;
  /** Les commandes que le commerce dit prêtes (PL4). */
  readonly readyOrders: ReadonlySet<string>;
}

/** Ce qu'un arrêt affiche à la porte — figé au départ, ou lu vivant au dépôt. */
interface DoorFacts {
  readonly reference: string;
  readonly customerLabel: string;
  readonly address: MyDeliveryStopView["address"];
  readonly window: MyDeliveryStopView["window"];
  readonly contact: MyDeliveryStopView["contact"];
  readonly signatureRequired: boolean;
  readonly depositAllowed: boolean;
  readonly orderNote: string;
  readonly addressNote: string | null;
}

/** Une commande que le commerce ne connaît plus : on n'invente ni adresse ni contact. */
const UNKNOWN_DOOR: DoorFacts = {
  reference: "",
  customerLabel: "",
  address: null,
  window: null,
  contact: null,
  signatureRequired: false,
  depositAllowed: false,
  orderNote: "",
  addressNote: null,
};

/**
 * **Ma tournée, vue par le livreur** (plan « Ma tournée », MT-D5 v2) — une
 * PROJECTION en liste blanche : chaque champ est nommé ici, et aucun montant
 * n'existe dans ce qui entre. Le même contrat avant et après le départ.
 *
 * - **ordre** : le rang figé au départ ; au dépôt, ou pour une tournée partie
 *   avant que le départ ne fige le rang, la position de composition — et
 *   `freeze` le dit ;
 * - **adresse, contact, fenêtre, signature, notes** : l'instantané du départ,
 *   la feuille vivante du commerce au dépôt ;
 * - **point GPS** : figé au départ ; sinon celui du carnet ;
 * - **procédure** : toujours vivante ; **bacs** : les tables de la livraison ;
 * - **à la porte** (`plan-a-la-porte.md`) : l'arrivée et le dépôt autorisé
 *   figés à l'exécution, `canDeposit` calculé ICI par la règle du domaine
 *   (AP-Q6), l'état de la commande lu vivant, les signalements de la tournée ;
 * - **la fiche et l'avancement du colisage** (PL4) : les produits de la
 *   commande sans montant, « prête » lue au commerce, les bacs déclarés
 *   (tables de la livraison) et attendus (la proposition, quand elle le dit).
 */
export function myDeliveryRoundView(inputs: MyDeliveryRoundInputs): MyDeliveryRoundView {
  const { round } = inputs;
  const freeze = freezeOf(round);
  const ordered =
    freeze === "departure"
      ? [...round.stops].sort(
          (a, b) => (a.departed?.departureRank ?? 0) - (b.departed?.departureRank ?? 0),
        )
      : round.stops;
  const stops = ordered.map((stop, index) => stopView(stop, index + 1, inputs));
  return {
    id: round.id,
    serviceDay: round.serviceDay,
    vehicleName: round.vehicleName,
    passage: round.passage,
    version: round.version,
    departedAt: round.departedAt?.toISOString() ?? null,
    returnedAt: round.returnedAt?.toISOString() ?? null,
    freeze,
    stops,
    home: inputs.home,
    incidents: inputs.incidents.map(deliveryIncidentView),
    readyStops: stops.filter((stop) => stop.packing === "ready").length,
    stopCount: stops.length,
  };
}

/** D'où viennent l'ordre et le point : le départ, la composition, ou ni l'un ni l'autre. */
export function freezeOf(round: DriverRoundRow): MyDeliveryRoundFreeze {
  if (round.departedAt === null) {
    return "live";
  }
  return round.stops.every((stop) => (stop.departed?.departureRank ?? null) !== null)
    ? "departure"
    : "not_frozen";
}

function stopView(
  stop: DriverStopRow,
  rank: number,
  inputs: MyDeliveryRoundInputs,
): MyDeliveryStopView {
  const frozenPoint = stop.departed !== null && stop.departed.departureRank !== null;
  const door = doorFactsOf(stop, inputs.sheets.get(stop.orderId));
  const sheet = inputs.stopSheets.get(stop.orderId);
  return {
    stopId: stop.stopId,
    rank,
    ...door,
    gps: frozenPoint
      ? (stop.departed?.gps ?? null)
      : (inputs.carnetPoints.get(stop.orderId) ?? null),
    procedure: (inputs.procedures.get(stop.orderId) ?? []).map(stepView),
    bins: stop.bins,
    coldBins: stop.coldBins,
    closedAt: stop.closedAt?.toISOString() ?? null,
    arrivedAt: stop.departed?.arrivedAt?.toISOString() ?? null,
    canDeposit: depositPermitted(door),
    orderState: inputs.orderStates.get(stop.orderId) ?? "open",
    sheet: (sheet?.lines ?? []).map(sheetLineView),
    packing: inputs.readyOrders.has(stop.orderId) ? "ready" : "in_progress",
    binsDeclared: stop.bins,
    ...(sheet !== undefined && sheet.binsExpected !== null
      ? { binsExpected: sheet.binsExpected }
      : {}),
  };
}

/** Une ligne de la fiche, champ par champ : rien d'autre ne passe. */
function sheetLineView(line: MyDeliverySheetLineView): MyDeliverySheetLineView {
  return {
    sku: line.sku,
    name: line.name,
    quantity: line.quantity,
    requiresCold: line.requiresCold,
  };
}

/** Figé si la tournée est partie, vivant sinon — champ par champ, en liste blanche. */
function doorFactsOf(stop: DriverStopRow, live: DepartureSheet | undefined): DoorFacts {
  if (stop.departed !== null) {
    const frozen = stop.departed;
    return {
      reference: frozen.reference,
      customerLabel: frozen.customerLabel,
      address: frozen.address,
      window: frozen.window,
      contact: frozen.contact,
      signatureRequired: frozen.signatureRequired,
      depositAllowed: frozen.depositAllowed,
      orderNote: frozen.note,
      addressNote: frozen.addressNote,
    };
  }
  if (live === undefined) {
    return UNKNOWN_DOOR;
  }
  return {
    reference: live.reference,
    customerLabel: live.customerLabel,
    address: live.address,
    window: live.window,
    contact: live.contact,
    signatureRequired: live.signatureRequired,
    depositAllowed: live.depositAllowed,
    orderNote: live.note,
    addressNote: live.addressNote,
  };
}

function stepView(step: DeliveryProcedureStep, index: number): MyDeliveryStepView {
  return {
    id: step.id,
    number: index + 1,
    title: step.title,
    body: step.body,
    hasPhoto: step.hasPhoto,
    photoRevision: step.photoRevision,
  };
}
