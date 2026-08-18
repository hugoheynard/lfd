import type {
  BillingAddressPayload,
  FulfillmentMethod,
  Recurrence,
  SubscriptionStatus,
} from "@lfd/contracts";

import {
  EmptyOverrideError,
  EmptySubscriptionError,
  InvalidDateRangeError,
  InvalidRoutingError,
  OccurrenceOutsideWindowError,
  SubscriptionAlreadyActiveError,
  SubscriptionAlreadyPausedError,
} from "../errors/subscription-errors.js";
import { IsoDate } from "../value-objects/iso-date.js";
import { SubscriptionLine } from "../value-objects/subscription-line.js";

/** Acheminement figé du panier : livraison (adresse libre) OU retrait (point). */
export interface SubscriptionRouting {
  readonly method: FulfillmentMethod;
  readonly deliveryAddress: BillingAddressPayload | null;
  readonly pickupAddressId: string | null;
}

/** Dérogation d'une échéance précise (« modifier cette commande uniquement »). */
export interface OccurrenceOverride {
  readonly date: IsoDate;
  readonly skipped: boolean;
  readonly lines: readonly SubscriptionLine[];
  readonly note: string;
}

/** Ce qu'il faut pour **ouvrir** un panier récurrent (aucun id : la base l'attribue). */
export interface OpenSubscriptionInput {
  readonly placedByUserId: string;
  readonly fromOrderId: string | null;
  readonly recurrence: Recurrence;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate | null;
  readonly routing: SubscriptionRouting;
  readonly note: string;
  readonly lines: readonly SubscriptionLine[];
}

/** Ce qu'il faut pour **reconstituer** un panier déjà persisté (il porte son id). */
export interface ReconstituteSubscriptionInput extends OpenSubscriptionInput {
  readonly id: string;
  readonly status: SubscriptionStatus;
  readonly overrides: readonly OccurrenceOverride[];
}

/** Une ligne prête à écrire (SKU + quantité). */
export interface PersistedLine {
  readonly sku: string;
  readonly quantity: number;
}

/** Une dérogation prête à écrire (date en `Date` minuit UTC pour `@db.Date`). */
export interface PersistedOverride {
  readonly occurrenceDate: Date;
  readonly skipped: boolean;
  readonly lines: readonly PersistedLine[];
  readonly note: string;
}

/** État de l'agrégat sérialisé pour la persistance — aucun type Prisma ici. */
export interface SubscriptionState {
  readonly id: string | null;
  readonly placedByUserId: string;
  readonly fromOrderId: string | null;
  readonly recurrence: Recurrence;
  readonly status: SubscriptionStatus;
  readonly startDate: Date;
  readonly endDate: Date | null;
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly deliveryAddress: BillingAddressPayload | null;
  readonly pickupAddressId: string | null;
  readonly note: string;
  readonly lines: readonly PersistedLine[];
  readonly overrides: readonly PersistedOverride[];
}

/** Ce qu'une dérogation reçoit du cas d'usage (lignes déjà en value-objects). */
export interface OverrideInput {
  readonly skipped: boolean;
  readonly lines: readonly SubscriptionLine[];
  readonly note: string;
}

/**
 * **Panier récurrent** (agrégat racine). Il porte ses invariants : on ne le mute
 * jamais par une écriture de colonne, mais par une méthode métier qui **refuse**
 * une transition illégale. `open()` fige l'intention ; `pause()/resume()`
 * arbitrent l'état ; `overrideOccurrence()` déroge à une échéance dans la fenêtre
 * de l'abonnement. La persistance passe par `toPersistence()`.
 */
export class Subscription {
  private status: SubscriptionStatus;
  private readonly overrides: Map<string, OccurrenceOverride>;

  private constructor(
    private readonly id: string | null,
    private readonly placedByUserId: string,
    private readonly fromOrderId: string | null,
    private readonly recurrence: Recurrence,
    status: SubscriptionStatus,
    private readonly startDate: IsoDate,
    private readonly endDate: IsoDate | null,
    private readonly routing: SubscriptionRouting,
    private readonly note: string,
    private readonly lines: readonly SubscriptionLine[],
    overrides: readonly OccurrenceOverride[],
  ) {
    this.status = status;
    this.overrides = new Map(overrides.map((o) => [o.date.toString(), o]));
  }

  /** Ouvre un panier récurrent neuf (sort **actif**, sans id). */
  static open(input: OpenSubscriptionInput): Subscription {
    if (input.lines.length === 0) {
      throw new EmptySubscriptionError();
    }
    if (input.endDate !== null && input.endDate.isBefore(input.startDate)) {
      throw new InvalidDateRangeError(input.startDate.toString(), input.endDate.toString());
    }
    const routing = normalizeRouting(input.routing);
    return new Subscription(
      null,
      input.placedByUserId,
      input.fromOrderId,
      input.recurrence,
      "active",
      input.startDate,
      input.endDate,
      routing,
      input.note,
      input.lines,
      [],
    );
  }

  /** Reconstitue un panier depuis la base (déjà valide — on ne rejoue pas les règles d'ouverture). */
  static reconstitute(input: ReconstituteSubscriptionInput): Subscription {
    return new Subscription(
      input.id,
      input.placedByUserId,
      input.fromOrderId,
      input.recurrence,
      input.status,
      input.startDate,
      input.endDate,
      input.routing,
      input.note,
      input.lines,
      input.overrides,
    );
  }

  /** Met en pause — refuse si déjà en pause. */
  pause(): void {
    if (this.status === "paused") {
      throw new SubscriptionAlreadyPausedError();
    }
    this.status = "paused";
  }

  /** Reprend — refuse si déjà actif. */
  resume(): void {
    if (this.status === "active") {
      throw new SubscriptionAlreadyActiveError();
    }
    this.status = "active";
  }

  /**
   * Déroge à une échéance précise. La date doit tomber **dans la fenêtre** de
   * l'abonnement. Sautée ⇒ aucune ligne ; sinon au moins une ligne (sinon ce
   * n'est ni une modification ni un saut).
   */
  overrideOccurrence(date: IsoDate, input: OverrideInput): void {
    if (date.isBefore(this.startDate) || (this.endDate !== null && date.isAfter(this.endDate))) {
      throw new OccurrenceOutsideWindowError(date.toString());
    }
    if (!input.skipped && input.lines.length === 0) {
      throw new EmptyOverrideError();
    }
    this.overrides.set(date.toString(), {
      date,
      skipped: input.skipped,
      lines: input.skipped ? [] : input.lines,
      note: input.note,
    });
  }

  /** Sérialise l'agrégat pour l'adaptateur de persistance (aucun type Prisma). */
  toPersistence(): SubscriptionState {
    return {
      id: this.id,
      placedByUserId: this.placedByUserId,
      fromOrderId: this.fromOrderId,
      recurrence: this.recurrence,
      status: this.status,
      startDate: this.startDate.toUtcDate(),
      endDate: this.endDate === null ? null : this.endDate.toUtcDate(),
      fulfillmentMethod: this.routing.method,
      deliveryAddress: this.routing.deliveryAddress,
      pickupAddressId: this.routing.pickupAddressId,
      note: this.note,
      lines: this.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
      overrides: [...this.overrides.values()].map(toPersistedOverride),
    };
  }
}

/** Livraison ⇒ adresse requise, pas de point ; retrait ⇒ pas d'adresse. Coupe le résidu. */
function normalizeRouting(routing: SubscriptionRouting): SubscriptionRouting {
  if (routing.method === "delivery") {
    if (routing.deliveryAddress === null) {
      throw new InvalidRoutingError("Une livraison exige une adresse.");
    }
    return { method: "delivery", deliveryAddress: routing.deliveryAddress, pickupAddressId: null };
  }
  return {
    method: routing.method,
    deliveryAddress: null,
    pickupAddressId: routing.pickupAddressId,
  };
}

function toPersistedOverride(override: OccurrenceOverride): PersistedOverride {
  return {
    occurrenceDate: override.date.toUtcDate(),
    skipped: override.skipped,
    lines: override.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
    note: override.note,
  };
}
