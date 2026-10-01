import type {
  DeparturePointView,
  GpsPoint,
  MyDeliveryRoundFreeze,
  MyDeliveryRoundView,
  MyDeliveryStepView,
  MyDeliveryStopView,
} from "@lfd/contracts";

import type { DeliveryProcedureStep } from "../channels/commerce/index.js";
import type { DepartureSheet } from "../domain/entities/departure-sheet.js";
import type { DriverRoundRow, DriverStopRow } from "../domain/ports/driver-rounds.reader.js";

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
}

/** Ce qu'un arrêt affiche à la porte — figé au départ, ou lu vivant au dépôt. */
interface DoorFacts {
  readonly reference: string;
  readonly customerLabel: string;
  readonly address: MyDeliveryStopView["address"];
  readonly window: MyDeliveryStopView["window"];
  readonly contact: MyDeliveryStopView["contact"];
  readonly signatureRequired: boolean;
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
 * - **procédure** : toujours vivante ; **bacs** : les tables de la livraison.
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
  return {
    id: round.id,
    serviceDay: round.serviceDay,
    vehicleName: round.vehicleName,
    passage: round.passage,
    version: round.version,
    departedAt: round.departedAt?.toISOString() ?? null,
    freeze,
    stops: ordered.map((stop, index) => stopView(stop, index + 1, inputs)),
    home: inputs.home,
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
  return {
    stopId: stop.stopId,
    rank,
    ...doorFactsOf(stop, inputs.sheets.get(stop.orderId)),
    gps: frozenPoint
      ? (stop.departed?.gps ?? null)
      : (inputs.carnetPoints.get(stop.orderId) ?? null),
    procedure: (inputs.procedures.get(stop.orderId) ?? []).map(stepView),
    bins: stop.bins,
    coldBins: stop.coldBins,
    closedAt: stop.closedAt?.toISOString() ?? null,
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
