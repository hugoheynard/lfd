import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { PurchaseBinCandidate } from "../entities/purchase-bin-candidate.js";
import type { PurchaseVehicleCandidate } from "../entities/purchase-vehicle-candidate.js";

/**
 * **Les faits de la bibliothèque d'achat** (`plan-bibliotheque-d-achat.md`,
 * lot B1). Les préfixes sont rangés sous `commandes` dans
 * `activity-module.ts`, avec le reste de la livraison. Le sujet est le
 * candidat ; la charge porte la fiche entière, prix HT compris — un prix de
 * catalogue, jamais un fait d'argent (B-D3). L'acteur n'est pas ici :
 * l'adaptateur du journal le lit dans le contexte.
 */
export const PURCHASE_VEHICLE_CANDIDATE_FACTS = {
  declared: "delivery_purchase_vehicle_candidate.declared",
  corrected: "delivery_purchase_vehicle_candidate.corrected",
  archived: "delivery_purchase_vehicle_candidate.archived",
  reactivated: "delivery_purchase_vehicle_candidate.reactivated",
} as const satisfies Readonly<Record<string, JournalFactType>>;

export const PURCHASE_BIN_CANDIDATE_FACTS = {
  declared: "delivery_purchase_bin_candidate.declared",
  corrected: "delivery_purchase_bin_candidate.corrected",
  archived: "delivery_purchase_bin_candidate.archived",
  reactivated: "delivery_purchase_bin_candidate.reactivated",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/** Ce qu'un candidat, de l'une ou l'autre sorte, offre au journal. */
interface JournaledCandidate {
  readonly id: string;
  readonly name: string;
  readonly specification: object;
}

const VEHICLE_SUBJECT = "delivery_purchase_vehicle_candidate";
const BIN_SUBJECT = "delivery_purchase_bin_candidate";

/** Un geste nommé sur un candidat : déclaré, archivé, réactivé — la fiche entière. */
abstract class PurchaseCandidateGestureEvent<
  C extends JournaledCandidate,
> implements JournaledEvent {
  constructor(readonly candidate: C) {}

  protected abstract readonly type: JournalFactType;
  protected abstract readonly subjectType: string;

  journalFact(): JournalFact {
    return {
      type: this.type,
      subjectType: this.subjectType,
      subjectId: this.candidate.id,
      payload: { subjectLabel: this.candidate.name, candidate: this.candidate.specification },
    };
  }
}

/** Une correction dit l'avant ET l'après. */
abstract class PurchaseCandidateCorrectedEvent<
  C extends JournaledCandidate,
> implements JournaledEvent {
  constructor(
    readonly candidate: C,
    readonly before: C["specification"],
  ) {}

  protected abstract readonly type: JournalFactType;
  protected abstract readonly subjectType: string;

  journalFact(): JournalFact {
    return {
      type: this.type,
      subjectType: this.subjectType,
      subjectId: this.candidate.id,
      payload: {
        subjectLabel: this.candidate.name,
        before: this.before,
        after: this.candidate.specification,
      },
    };
  }
}

export class PurchaseVehicleCandidateDeclaredEvent extends PurchaseCandidateGestureEvent<PurchaseVehicleCandidate> {
  protected readonly subjectType = VEHICLE_SUBJECT;
  protected readonly type = PURCHASE_VEHICLE_CANDIDATE_FACTS.declared;
}
export class PurchaseVehicleCandidateCorrectedEvent extends PurchaseCandidateCorrectedEvent<PurchaseVehicleCandidate> {
  protected readonly subjectType = VEHICLE_SUBJECT;
  protected readonly type = PURCHASE_VEHICLE_CANDIDATE_FACTS.corrected;
}
export class PurchaseVehicleCandidateArchivedEvent extends PurchaseCandidateGestureEvent<PurchaseVehicleCandidate> {
  protected readonly subjectType = VEHICLE_SUBJECT;
  protected readonly type = PURCHASE_VEHICLE_CANDIDATE_FACTS.archived;
}
export class PurchaseVehicleCandidateReactivatedEvent extends PurchaseCandidateGestureEvent<PurchaseVehicleCandidate> {
  protected readonly subjectType = VEHICLE_SUBJECT;
  protected readonly type = PURCHASE_VEHICLE_CANDIDATE_FACTS.reactivated;
}

export class PurchaseBinCandidateDeclaredEvent extends PurchaseCandidateGestureEvent<PurchaseBinCandidate> {
  protected readonly subjectType = BIN_SUBJECT;
  protected readonly type = PURCHASE_BIN_CANDIDATE_FACTS.declared;
}
export class PurchaseBinCandidateCorrectedEvent extends PurchaseCandidateCorrectedEvent<PurchaseBinCandidate> {
  protected readonly subjectType = BIN_SUBJECT;
  protected readonly type = PURCHASE_BIN_CANDIDATE_FACTS.corrected;
}
export class PurchaseBinCandidateArchivedEvent extends PurchaseCandidateGestureEvent<PurchaseBinCandidate> {
  protected readonly subjectType = BIN_SUBJECT;
  protected readonly type = PURCHASE_BIN_CANDIDATE_FACTS.archived;
}
export class PurchaseBinCandidateReactivatedEvent extends PurchaseCandidateGestureEvent<PurchaseBinCandidate> {
  protected readonly subjectType = BIN_SUBJECT;
  protected readonly type = PURCHASE_BIN_CANDIDATE_FACTS.reactivated;
}
