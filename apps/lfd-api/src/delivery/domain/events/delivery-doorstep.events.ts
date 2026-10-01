import type { StopDecisionSource } from "@lfd/contracts";
import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { DeliveryIncident } from "../entities/delivery-incident.js";
import type { DeliveryRound } from "../entities/delivery-round.js";
import type { DoorstepRoundKey, DoorstepStop } from "../entities/doorstep-stop.js";
import type { CitedOrder } from "./delivery-round.events.js";

/**
 * **Les faits de la porte** (`documentation/livraisons/plan-a-la-porte.md`,
 * lot A). Sujet : la tournée, comme les faits de la composition — le préfixe
 * `delivery_round.` les range au même endroit du journal. L'acteur, le
 * livreur, est sur la ligne : l'adaptateur du journal le lit dans le contexte.
 */
export const DOORSTEP_FACTS = {
  returned: "delivery_round.returned",
  stopArrived: "delivery_round.stop_arrived",
  incidentReported: "delivery_round.incident_reported",
  stopClosedWithoutHandover: "delivery_round.stop_closed_without_handover",
  stopHandedOver: "delivery_round.stop_handed_over",
  stopDeposited: "delivery_round.stop_deposited",
  stopDepositAuthorized: "delivery_round.stop_deposit_authorized",
  stopBroughtBack: "delivery_round.stop_brought_back",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/** Pourquoi un arrêt se clôt sans remise : la commande l'était déjà, ou elle est annulée. */
export type ClosedWithoutHandoverCause = "handed_over" | "cancelled";

/** La commande d'un arrêt, citée par son numéro figé au départ — par son id nu sans lui. */
export function citeStopOrder(orderId: string, reference: string): CitedOrder {
  return reference === "" ? orderId : { id: orderId, name: reference };
}

function doorstepFact(
  type: JournalFactType,
  round: DoorstepRoundKey,
  extra: Record<string, unknown>,
): JournalFact {
  return {
    type,
    subjectType: "delivery_round",
    subjectId: round.roundId,
    payload: {
      subjectLabel: round.vehicleName,
      day: round.serviceDay,
      passage: round.passage,
      ...extra,
    },
  };
}

/** La clé de journal d'une tournée chargée. */
export function roundKeyOf(round: DeliveryRound): DoorstepRoundKey {
  return {
    roundId: round.id,
    vehicleName: round.vehicleName,
    serviceDay: round.serviceDay,
    passage: round.passage,
  };
}

/**
 * « Tournée terminée » (`parcours-du-livreur.md`, PL2) — et combien d'arrêts
 * restaient ouverts : ils le restent, « Non remis » les montre.
 */
export class DeliveryRoundReturnedEvent implements JournaledEvent {
  constructor(readonly round: DeliveryRound) {}

  journalFact(): JournalFact {
    return doorstepFact(DOORSTEP_FACTS.returned, roundKeyOf(this.round), {
      openStops: this.round.liveStops.length,
    });
  }
}

/** « Je suis arrivé » — une fois : une seconde arrivée n'écrit rien, donc ne publie rien. */
export class DeliveryStopArrivedEvent implements JournaledEvent {
  constructor(readonly stop: DoorstepStop) {}

  journalFact(): JournalFact {
    return doorstepFact(DOORSTEP_FACTS.stopArrived, this.stop.round, {
      order: citeStopOrder(this.stop.orderId, this.stop.reference),
    });
  }
}

/** Un problème signalé. La note reste sur sa ligne : un texte libre n'entre pas au journal. */
export class DeliveryIncidentReportedEvent implements JournaledEvent {
  constructor(
    readonly round: DoorstepRoundKey,
    readonly incident: DeliveryIncident,
    readonly order: CitedOrder | null,
  ) {}

  journalFact(): JournalFact {
    return doorstepFact(DOORSTEP_FACTS.incidentReported, this.round, {
      order: this.order,
      family: this.incident.family,
      reason: this.incident.reason,
      withPhoto: this.incident.hasPhoto,
    });
  }
}

/** Un arrêt clos sans remise (AP-D2) — et pourquoi. */
export class DeliveryStopClosedWithoutHandoverEvent implements JournaledEvent {
  constructor(
    readonly round: DeliveryRound,
    readonly order: CitedOrder,
    readonly cause: ClosedWithoutHandoverCause,
  ) {}

  journalFact(): JournalFact {
    return doorstepFact(DOORSTEP_FACTS.stopClosedWithoutHandover, roundKeyOf(this.round), {
      order: this.order,
      cause: this.cause,
    });
  }
}

/**
 * « Remis au client » (B1) — la remise attestée au retrait, l'arrêt clos. Le
 * nom de qui a réceptionné reste sur sa pièce : un texte libre n'entre pas au
 * journal.
 */
export class DeliveryStopHandedOverEvent implements JournaledEvent {
  constructor(
    readonly round: DeliveryRound,
    readonly order: CitedOrder,
    readonly signed: boolean,
  ) {}

  journalFact(): JournalFact {
    return doorstepFact(DOORSTEP_FACTS.stopHandedOver, roundKeyOf(this.round), {
      order: this.order,
      signed: this.signed,
    });
  }
}

/**
 * « Déposé avec preuve » (B2) — le dépôt attesté au retrait (`deposit`),
 * l'arrêt clos. Personne n'a réceptionné : la photo est la seule pièce.
 */
export class DeliveryStopDepositedEvent implements JournaledEvent {
  constructor(
    readonly round: DeliveryRound,
    readonly order: CitedOrder,
  ) {}

  journalFact(): JournalFact {
    return doorstepFact(DOORSTEP_FACTS.stopDeposited, roundKeyOf(this.round), {
      order: this.order,
    });
  }
}

/**
 * « Autoriser le dépôt cette fois » (B3, LB-Q5) — la décision d'un commercial
 * sur un arrêt signalé. L'acteur, le commercial, est sur la ligne. La tournée
 * n'est pas mutée : sa clé suffit.
 */
export class DeliveryStopDepositAuthorizedEvent implements JournaledEvent {
  constructor(
    readonly round: DoorstepRoundKey,
    readonly order: CitedOrder,
    readonly source: StopDecisionSource,
  ) {}

  journalFact(): JournalFact {
    return doorstepFact(DOORSTEP_FACTS.stopDepositAuthorized, this.round, {
      order: this.order,
      source: this.source,
    });
  }
}

/** « Rapporter » (B3, LB-Q2) — l'arrêt clos « rapporté » ; la commande n'est pas livrée. */
export class DeliveryStopBroughtBackEvent implements JournaledEvent {
  constructor(
    readonly round: DoorstepRoundKey,
    readonly order: CitedOrder,
    readonly source: StopDecisionSource,
  ) {}

  journalFact(): JournalFact {
    return doorstepFact(DOORSTEP_FACTS.stopBroughtBack, this.round, {
      order: this.order,
      source: this.source,
    });
  }
}
