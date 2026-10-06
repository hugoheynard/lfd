import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus de la **composition des tournées** (plan de tournée, lot 3) — lus
 * au dépôt, un matin, par qui n'a pas le code sous les yeux : chacun nomme le
 * cas réel et le geste de sortie (`CLAUDE.md` §0).
 */

/** Aucune tournée sous cet identifiant. */
export class DeliveryRoundNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super(
      "delivery.round_not_found",
      `Aucune tournée sous l'identifiant ${id} : rechargez la composition du jour.`,
    );
  }
}

/** L'arrêt n'est pas (ou plus) dans cette tournée. */
export class DeliveryStopNotFoundError extends ResourceNotFoundError {
  constructor(stopId: string) {
    super(
      "delivery.stop_not_found",
      `L'arrêt ${stopId} n'est pas dans cette tournée : il a peut-être été déplacé ou retiré, rechargez la composition.`,
    );
  }
}

/**
 * **La composition a changé depuis la lecture** — quelqu'un d'autre a écrit
 * cette tournée entre-temps. Rien n'est écrit : on recharge et on refait.
 */
export class DeliveryRoundStaleError extends BusinessError {
  constructor(vehicleName: string) {
    super(
      "delivery.round_stale",
      `La composition de la tournée « ${vehicleName} » a changé depuis votre lecture : rechargez, puis refaites votre geste.`,
    );
  }
}

/** Le véhicule est retiré avant ce jour : il ne peut pas porter de tournée (C14). */
export class VehicleInactiveOnDayError extends BusinessError {
  constructor(vehicleName: string, day: string) {
    super(
      "delivery.vehicle_inactive_on_day",
      `Le véhicule « ${vehicleName} » est retiré de la flotte avant le ${day} : réactivez-le, ou composez sur un autre véhicule.`,
    );
  }
}

/**
 * **Retirer un véhicule qui a une tournée à venir** (C14) : le refus nomme les
 * jours, pour qu'on sache quoi réaffecter d'abord. Interdire plutôt que
 * signaler.
 */
export class VehicleHasUpcomingRoundsError extends BusinessError {
  constructor(vehicleName: string, days: readonly string[]) {
    super(
      "delivery.vehicle_has_upcoming_rounds",
      `Le véhicule « ${vehicleName} » porte encore une tournée le ${days.join(", le ")} : déplacez ou retirez ses arrêts, puis retirez-le.`,
    );
  }
}

/** Où une commande est déjà composée — de quoi nommer la tournée dans le refus. */
export interface LiveStopHolder {
  readonly vehicleName: string;
  readonly serviceDay: string;
  readonly passage: number;
}

/**
 * **La commande est déjà dans une tournée vivante** (I3) — tous jours
 * confondus. `holder` est `null` quand c'est l'index qui a refusé : la
 * transaction est perdue, et ne peut plus dire laquelle — ni quelle commande,
 * quand plusieurs s'écrivaient ensemble (`reference` est alors `null`).
 */
export class OrderAlreadyInRoundError extends BusinessError {
  constructor(reference: string | null, holder: LiveStopHolder | null) {
    const order = reference === null ? "Cette commande" : `La commande ${reference}`;
    super(
      "delivery.order_already_in_round",
      holder === null
        ? `${order} vient d'être placée dans une autre tournée : rechargez la composition.`
        : `${order} est déjà dans la tournée « ${holder.vehicleName} » du ${holder.serviceDay} (passage ${String(holder.passage)}) : retirez-la de celle-ci d'abord.`,
    );
  }
}

/** Pourquoi une commande ne peut pas entrer dans une tournée de ce jour. */
export type UnassignableReason = "unknown" | "cancelled" | "not_delivery" | "not_this_day";

const UNASSIGNABLE_WORDS: Readonly<Record<UnassignableReason, string>> = {
  unknown: "n'existe pas",
  cancelled: "est annulée",
  not_delivery: "n'est pas en livraison (retrait au comptoir)",
  not_this_day: "n'est pas à livrer ce jour-là",
};

/** La commande n'est pas une livraison attendue ce jour-là. */
export class OrderNotAssignableError extends BusinessError {
  constructor(reference: string, day: string, reason: UnassignableReason) {
    super(
      "delivery.order_not_assignable",
      `La commande ${reference} ${UNASSIGNABLE_WORDS[reason]} : elle ne peut pas entrer dans une tournée du ${day}. Rechargez la composition.`,
    );
  }
}

/** Réordonner avec une liste qui n'est pas exactement les arrêts de la tournée (I2). */
export class InvalidStopOrderError extends DomainError {
  constructor() {
    super(
      "delivery.stop_order_invalid",
      "Le nouvel ordre doit reprendre chaque arrêt de la tournée une fois, et seulement eux : rechargez la composition, puis réordonnez.",
    );
  }
}

/**
 * Affecter à un rang que la tournée n'a pas (CA7) : la composition affichée
 * est plus vieille que la tournée, ou le rang a été mal lu.
 */
export class InvalidStopPositionError extends DomainError {
  constructor(position: number, stopCount: number) {
    super(
      "delivery.stop_position_invalid",
      `La tournée compte ${String(stopCount)} arrêt(s) : on ne peut pas y placer une commande après le ${String(position)}e. Rechargez la composition, puis placez-la de nouveau.`,
    );
  }
}

/** Déplacer un arrêt vers la tournée où il est déjà. */
export class SameRoundMoveError extends DomainError {
  constructor() {
    super(
      "delivery.move_same_round",
      "L'arrêt est déjà dans cette tournée : pour changer sa place, réordonnez-la.",
    );
  }
}

/** Déplacer un arrêt vers une tournée d'un autre jour (I7 : même jour seulement). */
export class CrossDayMoveError extends DomainError {
  constructor(fromDay: string, toDay: string) {
    super(
      "delivery.move_other_day",
      `Un arrêt du ${fromDay} ne se déplace pas vers une tournée du ${toDay} : retirez-le, puis répartissez la commande sur son jour.`,
    );
  }
}

/** Numéro de passage hors de 1, 2, 3… */
export class InvalidPassageError extends DomainError {
  constructor(passage: number) {
    super(
      "delivery.passage_invalid",
      `Le passage ${String(passage)} n'est pas un numéro de tournée (1, 2, 3…).`,
    );
  }
}

/**
 * **L'arrêt est clos** (I4) : livré ou raté, il n'est plus vivant — il ne se
 * réordonne, ne se déplace ni ne se retire. Rien ne clôt encore un arrêt à ce
 * lot (le lot 6 le fera) ; la règle est posée avant que le cas n'existe.
 */
export class DeliveryStopClosedError extends BusinessError {
  constructor(stopId: string) {
    super(
      "delivery.stop_closed",
      `L'arrêt ${stopId} est clos (livré ou raté) : il ne se déplace, ne se réordonne ni ne se retire plus. Rechargez la composition.`,
    );
  }
}

/** Une tournée relue en base viole I2 : c'est un défaut, pas un geste à refaire. */
export class DeliveryRoundCorruptedError extends TechnicalError {
  constructor(roundId: string) {
    super(
      "delivery.round_corrupted",
      `Les positions des arrêts de la tournée ${roundId} ne sont pas contiguës : signalez-le à l'équipe technique, sans retoucher la tournée.`,
    );
  }
}

/** Le jour n'existe pas au calendrier (`2026-02-30`). */
export class InvalidServiceDayError extends DomainError {
  constructor(day: string) {
    super(
      "delivery.service_day_invalid",
      `Le ${day} n'est pas un jour du calendrier : choisissez un jour au format AAAA-MM-JJ.`,
    );
  }
}

/**
 * L'horaire prévu d'une tournée ne tient pas debout — un retour avant le
 * départ, une distance négative ou fractionnaire. C'est le calcul routier qui
 * le produit : un défaut, pas un geste à refaire.
 */
export class InvalidPlannedTimingError extends TechnicalError {
  constructor(reason: string) {
    super(
      "delivery.planned_timing_invalid",
      `L'horaire prévu de la tournée est incohérent (${reason}) : la tournée est enregistrée sans horaire ; signalez-le à l'équipe technique.`,
    );
  }
}
