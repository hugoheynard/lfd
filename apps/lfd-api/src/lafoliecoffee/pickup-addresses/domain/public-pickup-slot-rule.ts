import { minutesOfDay, type Weekday } from "@lfd/contracts";

import {
  PublicPickupBadgeEmptyError,
  PublicPickupServiceCapacityError,
  PublicPickupSlotRangeError,
  PublicPickupSlotStepError,
} from "./pickup-errors.js";

/** Ce qu'une règle porte, en primitives — la forme lue et écrite par l'adaptateur. */
export interface PublicPickupSlotRuleState {
  readonly weekday: Weekday | null;
  readonly startTime: string;
  readonly endTime: string;
  readonly slotMinutes: number;
  readonly badge: string | null;
  readonly serviceCapacity: number | null;
}

/**
 * **Une règle de créneaux publics** — une plage homogène d'un point, découpée à
 * pas constant pour le visiteur.
 *
 * Un value object et pas une entité : une règle n'a pas de cycle de vie, elle
 * est remplacée en bloc avec les autres. Ce qu'elle porte, ce sont **quatre
 * refus qui ne concernent qu'elle** (plan `plan-creneaux-de-retrait.md`, D7,
 * vitruve S4) — la plage vide, la découpe qui n'ouvre rien, le badge vide et la
 * capacité qui ne sert personne. Le chevauchement, lui, regarde l'ensemble : il
 * appartient à {@link PickupSchedule}.
 *
 * Le patron est celui du contexte : `PickupDiscount.of` — constructeur privé,
 * factory qui nomme l'intention et refuse.
 */
export class PublicPickupSlotRule {
  private constructor(
    readonly weekday: Weekday | null,
    readonly startTime: string,
    readonly endTime: string,
    readonly slotMinutes: number,
    readonly badge: string | null,
    readonly serviceCapacity: number | null,
  ) {}

  /**
   * @throws {PublicPickupSlotRangeError} la plage est vide ou à l'envers.
   * @throws {PublicPickupSlotStepError} aucun créneau ne tient dans la plage.
   * @throws {PublicPickupBadgeEmptyError} le badge est une chaîne vide.
   * @throws {PublicPickupServiceCapacityError} la capacité est nulle ou négative.
   */
  static of(state: PublicPickupSlotRuleState): PublicPickupSlotRule {
    const start = minutesOfDay(state.startTime);
    const end = minutesOfDay(state.endTime);
    if (start >= end) {
      throw new PublicPickupSlotRangeError(state.startTime, state.endTime);
    }
    if (state.slotMinutes <= 0 || start + state.slotMinutes > end) {
      throw new PublicPickupSlotStepError(state.slotMinutes, state.startTime, state.endTime);
    }
    const badge = state.badge === null ? null : state.badge.trim();
    if (badge === "") {
      throw new PublicPickupBadgeEmptyError();
    }
    if (state.serviceCapacity !== null && state.serviceCapacity <= 0) {
      throw new PublicPickupServiceCapacityError(state.serviceCapacity);
    }
    return new PublicPickupSlotRule(
      state.weekday,
      state.startTime,
      state.endTime,
      state.slotMinutes,
      badge,
      state.serviceCapacity,
    );
  }

  /** Le début et la fin en minutes depuis minuit — l'unité de comparaison des plages. */
  get startMinutes(): number {
    return minutesOfDay(this.startTime);
  }

  get endMinutes(): number {
    return minutesOfDay(this.endTime);
  }

  /**
   * Cette règle et l'autre peuvent-elles viser le **même jour** ? Une règle sans
   * jour vaut tous les jours : elle croise donc toutes les autres.
   */
  sharesDaysWith(other: PublicPickupSlotRule): boolean {
    return this.weekday === null || other.weekday === null || this.weekday === other.weekday;
  }

  /** Les deux plages se recouvrent-elles, ne serait-ce que d'une minute ? */
  overlapsHours(other: PublicPickupSlotRule): boolean {
    return this.startMinutes < other.endMinutes && other.startMinutes < this.endMinutes;
  }

  /** « lun. 07:00–09:00 » — ce qu'un refus doit pouvoir montrer à l'opérateur. */
  label(): string {
    const day = this.weekday ?? "tous les jours";
    return `${day} ${this.startTime}–${this.endTime}`;
  }

  /** L'état à écrire. */
  toPersistence(): PublicPickupSlotRuleState {
    return {
      weekday: this.weekday,
      startTime: this.startTime,
      endTime: this.endTime,
      slotMinutes: this.slotMinutes,
      badge: this.badge,
      serviceCapacity: this.serviceCapacity,
    };
  }
}
