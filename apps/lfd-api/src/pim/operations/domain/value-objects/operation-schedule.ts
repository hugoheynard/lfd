import { instantToLocal } from "@lfd/contracts";
import type { OperationState } from "@lfd/pim-contracts";

import {
  InvalidOperationInstantError,
  InvalidOperationScheduleError,
} from "../errors/operation-errors.js";
import { CalendarDay } from "./calendar-day.js";

/** Les cinq dates telles qu'on les donne à l'agrégat — jours encore bruts. */
export interface OperationScheduleInput {
  readonly announceFrom: Date;
  readonly orderFrom: Date | null;
  readonly orderUntil: Date;
  readonly pickupFrom: string;
  readonly pickupUntil: string;
}

/**
 * **Les cinq dates d'une opération** (D2), et l'ordre qui les tient ensemble :
 *
 * `announceFrom ≤ orderFrom < orderUntil ≤ fin(pickupUntil)`, `pickupFrom ≤ pickupUntil`.
 *
 * Un seul value object pour les cinq, parce que leur validité ne se juge qu'à
 * cinq : redater l'annonce seule ne peut pas savoir si elle passe après
 * l'ouverture. C'est aussi pourquoi l'écran les réécrit ensemble.
 *
 * ⚠️ Rien n'oblige `pickupFrom` à suivre l'ouverture des commandes : le plan
 * ne le demande pas, et un retrait qui commence avant la clôture est le cas
 * normal (on retire la galette du 3 pendant qu'on commande celle du 10).
 */
export class OperationSchedule {
  private constructor(
    readonly announceFrom: Date,
    readonly orderFrom: Date | null,
    readonly orderUntil: Date,
    readonly pickupFrom: CalendarDay,
    readonly pickupUntil: CalendarDay,
  ) {}

  /** @throws {InvalidOperationScheduleError} les dates se contredisent. */
  static of(input: OperationScheduleInput): OperationSchedule {
    ensureReadable(input.announceFrom, "l'annonce");
    ensureReadable(input.orderUntil, "la clôture des commandes");
    if (input.orderFrom !== null) {
      ensureReadable(input.orderFrom, "l'ouverture des commandes");
    }
    const schedule = new OperationSchedule(
      input.announceFrom,
      input.orderFrom,
      input.orderUntil,
      CalendarDay.of(input.pickupFrom, "le premier jour de retrait"),
      CalendarDay.of(input.pickupUntil, "le dernier jour de retrait"),
    );
    schedule.ensureOrdered();
    return schedule;
  }

  /** Quand la commande ouvre : `orderFrom`, sinon dès l'annonce. */
  get opensAt(): Date {
    return this.orderFrom ?? this.announceFrom;
  }

  /** Quand tout s'éteint : minuit, heure de Paris, le lendemain du dernier retrait. */
  get endsAt(): Date {
    return this.pickupUntil.end();
  }

  /**
   * **L'état à cet instant** — calculé, jamais stocké (D2). Chaque borne est
   * incluse du côté de l'état qui commence : à `orderUntil` pile, c'est clos.
   */
  stateAt(now: Date): OperationState {
    const at = now.getTime();
    if (at < this.announceFrom.getTime()) {
      return "preparing";
    }
    if (at < this.opensAt.getTime()) {
      return "announced";
    }
    if (at < this.orderUntil.getTime()) {
      return "open";
    }
    return at < this.endsAt.getTime() ? "closed" : "ended";
  }

  private ensureOrdered(): void {
    if (this.announceFrom.getTime() > this.opensAt.getTime()) {
      throw InvalidOperationScheduleError.announceAfterOrder(
        inParis(this.announceFrom),
        inParis(this.opensAt),
      );
    }
    if (this.opensAt.getTime() >= this.orderUntil.getTime()) {
      throw InvalidOperationScheduleError.emptyOrderWindow(
        inParis(this.opensAt),
        inParis(this.orderUntil),
      );
    }
    if (this.pickupFrom.isAfter(this.pickupUntil)) {
      throw InvalidOperationScheduleError.pickupInverted(
        this.pickupFrom.toFrench(),
        this.pickupUntil.toFrench(),
      );
    }
    if (this.orderUntil.getTime() > this.endsAt.getTime()) {
      throw InvalidOperationScheduleError.orderAfterPickupEnd(
        inParis(this.orderUntil),
        this.pickupUntil.toFrench(),
      );
    }
  }
}

function ensureReadable(instant: Date, field: string): void {
  if (Number.isNaN(instant.getTime())) {
    throw new InvalidOperationInstantError(field);
  }
}

/** `21/12/2026 à 12:00` — en heure de Paris, comme l'écran l'a saisi. */
function inParis(instant: Date): string {
  const local = instantToLocal(instant);
  const [year, month, day] = local.day.split("-");
  return `${day ?? ""}/${month ?? ""}/${year ?? ""} à ${local.time}`;
}
