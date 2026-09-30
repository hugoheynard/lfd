import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { Vehicle, VehicleIdentity } from "../entities/vehicle.js";

/**
 * **Les faits de la flotte.** Le préfixe `delivery_vehicle.` est rangé sous
 * `commandes` dans `activity-module.ts` : sans lui, ils n'apparaîtraient dans
 * aucun filtre du journal. L'acteur n'est pas ici : l'adaptateur du journal le
 * lit dans le contexte de requête.
 */
export const VEHICLE_FACTS = {
  added: "delivery_vehicle.added",
  corrected: "delivery_vehicle.corrected",
  retired: "delivery_vehicle.retired",
  reactivated: "delivery_vehicle.reactivated",
} as const satisfies Readonly<Record<string, JournalFactType>>;

const SUBJECT_TYPE = "delivery_vehicle";

/** Un geste nommé sur un véhicule : entré, retiré, réactivé. */
abstract class VehicleGestureEvent implements JournaledEvent {
  constructor(readonly vehicle: Vehicle) {}

  protected abstract readonly type: JournalFactType;

  journalFact(): JournalFact {
    return {
      type: this.type,
      subjectType: SUBJECT_TYPE,
      subjectId: this.vehicle.id,
      payload: {
        subjectLabel: this.vehicle.name,
        plate: this.vehicle.plate.value,
        cargo: this.vehicle.identity.cargo ?? null,
        wheelArches: this.vehicle.identity.wheelArches ?? null,
        refrigeration: this.vehicle.identity.refrigeration ?? null,
        energy: this.vehicle.energy,
      },
    };
  }
}

export class VehicleAddedEvent extends VehicleGestureEvent {
  protected readonly type = VEHICLE_FACTS.added;
}

export class VehicleRetiredEvent extends VehicleGestureEvent {
  protected readonly type = VEHICLE_FACTS.retired;
}

export class VehicleReactivatedEvent extends VehicleGestureEvent {
  protected readonly type = VEHICLE_FACTS.reactivated;
}

/** Une fiche au journal : `cargo`, `wheelArches`, `refrigeration` et `energy` toujours présents, `null` si absents. */
function journaledIdentity(identity: VehicleIdentity): Readonly<Record<string, unknown>> {
  return {
    name: identity.name,
    plate: identity.plate,
    cargo: identity.cargo ?? null,
    wheelArches: identity.wheelArches ?? null,
    refrigeration: identity.refrigeration ?? null,
    energy: identity.energy ?? null,
  };
}

/** La charge dit l'avant ET l'après : « la plaque a changé » sans l'ancienne n'apprend rien. */
export class VehicleCorrectedEvent implements JournaledEvent {
  constructor(
    readonly vehicle: Vehicle,
    readonly before: VehicleIdentity,
  ) {}

  journalFact(): JournalFact {
    return {
      type: VEHICLE_FACTS.corrected,
      subjectType: SUBJECT_TYPE,
      subjectId: this.vehicle.id,
      payload: {
        subjectLabel: this.vehicle.name,
        before: journaledIdentity(this.before),
        after: journaledIdentity(this.vehicle.identity),
      },
    };
  }
}
