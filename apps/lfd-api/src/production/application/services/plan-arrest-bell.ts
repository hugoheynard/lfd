import type { StaffPermission } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import {
  StaffNotifier,
  type StaffNotice,
} from "../../../staff/notifications/domain/ports/staff-notifier.js";
import { frenchDayLabel } from "../../domain/services/auto-close-round.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * Qui reçoit : ceux qui peuvent arrêter le plan (plan `plan-arret-du-plan.md`,
 * §4, §6, S8). Résolu à la lecture et à l'envoi par la cloche, jamais figé.
 */
const AUDIENCE: StaffPermission = "production_count_stop:write";

/** Où l'on arrête le plan : la bande du prévisionnel. */
const FORECAST_LINK = "/production/previsionnel";

/** Les trois natures — une notification par nature ET par journée (S8). */
export const PLAN_ARREST_NOTICES = {
  nothingToArrest: "production.plan_nothing_to_arrest",
  notArrested: "production.plan_not_arrested",
  todayNotArrested: "production.plan_today_not_arrested",
} as const;

type PlanArrestKind = (typeof PLAN_ARREST_NOTICES)[keyof typeof PLAN_ARREST_NOTICES];

/**
 * **La cloche de l'arrêt du plan** — les trois annonces du tour automatique,
 * dites en un seul endroit (plan `plan-arret-du-plan.md`, §3, §4, S4, S8,
 * lot A2).
 *
 * La clé d'idempotence est `(nature, journée)` : `staff_notification` la tient
 * unique, donc un tour rejoué toutes les cinq minutes — ou deux instances
 * ensemble — ne sonne qu'une fois par journée et par nature.
 */
@Injectable()
export class PlanArrestBell {
  constructor(private readonly notifier: StaffNotifier) {}

  /** Mode automatique, lendemain sans commande (Q2). */
  async nothingToArrest(day: ServiceDay, at: Date): Promise<void> {
    const label = frenchDayLabel(day.value);
    await this.ring(PLAN_ARREST_NOTICES.nothingToArrest, day, at, {
      subject: `Rien à arrêter pour le ${label} : aucune commande`,
      body: `L'arrêt automatique n'a trouvé aucune commande pour le ${label}. Rien n'est à produire ; si des commandes arrivent encore, arrêtez le plan depuis le prévisionnel.`,
    });
  }

  /**
   * Le plan du lendemain n'est pas arrêté : l'heure d'alerte est passée (mode
   * manuel), ou l'arrêt automatique a échoué — `failure` dit pourquoi.
   */
  async notArrested(day: ServiceDay, at: Date, failure: string | null = null): Promise<void> {
    const label = frenchDayLabel(day.value);
    const body =
      failure === null
        ? `L'heure d'alerte est passée : arrêtez le plan du ${label} depuis le prévisionnel.`
        : `L'arrêt automatique a échoué (${failure}). Arrêtez le plan du ${label} à la main depuis le prévisionnel.`;
    await this.ring(PLAN_ARREST_NOTICES.notArrested, day, at, {
      subject: `Le plan du ${label} n'est pas arrêté`,
      body,
    });
  }

  /** Le rattrapage (S4) : le plan d'aujourd'hui porte des commandes et n'est pas arrêté. */
  async todayNotArrested(day: ServiceDay, at: Date): Promise<void> {
    const label = frenchDayLabel(day.value);
    await this.ring(PLAN_ARREST_NOTICES.todayNotArrested, day, at, {
      subject: "Le plan d'aujourd'hui n'a pas été arrêté",
      body: `Le plan du ${label} porte des commandes et n'est pas arrêté : arrêtez-le depuis le prévisionnel pour lancer la fournée.`,
    });
  }

  private async ring(
    kind: PlanArrestKind,
    day: ServiceDay,
    at: Date,
    words: Pick<StaffNotice, "subject" | "body">,
  ): Promise<void> {
    await this.notifier.notify([
      {
        kind,
        ...words,
        link: FORECAST_LINK,
        idempotencyKey: `notification:${kind}:${day.value}`,
        occurredAt: at,
        audience: AUDIENCE,
      },
    ]);
  }
}
