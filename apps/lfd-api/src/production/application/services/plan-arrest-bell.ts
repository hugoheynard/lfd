import type { StaffPermission } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import {
  StaffNotifier,
  type StaffNotice,
} from "../../../staff/notifications/domain/ports/staff-notifier.js";
import { frenchDayLabel } from "../../domain/services/auto-close-round.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * Qui reçoit : ceux qui peuvent arrêter le plan (plan `arret-du-plan.md`,
 * §4, §6, S8). Résolu à la lecture et à l'envoi par la cloche, jamais figé.
 */
const AUDIENCE: StaffPermission = "production_count_stop:write";

/** Où l'on arrête le plan : la bande du prévisionnel. */
const FORECAST_LINK = "/production/previsionnel";

/**
 * Les natures — une notification par nature ET par journée (S8).
 *
 * `autoCloseStalled` (Q8) a sa nature propre plutôt que de réutiliser
 * `notArrested` : la clé de celle-ci peut être déjà prise pour la journée (une
 * alerte manuelle partie avant un passage en automatique), et l'idempotence
 * avalerait alors l'alerte qui compte ; et le geste diffère — ici, on ne sait
 * pas jusqu'où la tentative morte est allée.
 */
export const PLAN_ARREST_NOTICES = {
  nothingToArrest: "production.plan_nothing_to_arrest",
  notArrested: "production.plan_not_arrested",
  todayNotArrested: "production.plan_today_not_arrested",
  autoCloseStalled: "production.plan_auto_close_stalled",
  dossierNotSent: "production.dossier_not_sent",
} as const;

type PlanArrestKind = (typeof PLAN_ARREST_NOTICES)[keyof typeof PLAN_ARREST_NOTICES];

/**
 * **La cloche de l'arrêt du plan** — les annonces du tour automatique,
 * dites en un seul endroit (plan `arret-du-plan.md`, §3, §4, S4, S8,
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

  /** L'arrêt automatique est resté en suspens plus de quinze minutes (Q8). */
  async autoCloseStalled(day: ServiceDay, at: Date): Promise<void> {
    const label = frenchDayLabel(day.value);
    await this.ring(PLAN_ARREST_NOTICES.autoCloseStalled, day, at, {
      subject: `L'arrêt automatique du plan du ${label} n'a pas abouti`,
      body: `L'arrêt automatique a commencé mais ne s'est pas terminé. Le plan du ${label} n'est peut-être pas arrêté : vérifiez-le et arrêtez-le à la main depuis le prévisionnel.`,
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

  /**
   * Le dossier du jour n'a pas pu partir à certains destinataires (plan
   * `plan-envoi-du-dossier.md`, décision 5, E3). Une alerte par ENVOI, pas
   * par journée : la clé porte l'instant de la clôture ou du retirage, sans
   * quoi l'échec d'un dossier complété serait avalé par celui de l'arrêt.
   */
  async dossierNotSent(
    day: ServiceDay,
    occasionAt: Date,
    names: readonly string[],
    at: Date,
  ): Promise<void> {
    const label = frenchDayLabel(day.value);
    await this.ring(
      PLAN_ARREST_NOTICES.dossierNotSent,
      day,
      at,
      {
        subject: `Le dossier du ${label} n'a pas pu être envoyé à ${names.join(", ")}`,
        body: `L'envoi a été refusé pour ${names.join(", ")}. Vérifiez leur adresse dans Production › Réglages, puis transmettez-leur le dossier téléchargé depuis le prévisionnel ; il ne repartira pas tout seul.`,
      },
      occasionAt.toISOString(),
    );
  }

  private async ring(
    kind: PlanArrestKind,
    day: ServiceDay,
    at: Date,
    words: Pick<StaffNotice, "subject" | "body">,
    occasion: string | null = null,
  ): Promise<void> {
    await this.notifier.notify([
      {
        kind,
        ...words,
        link: FORECAST_LINK,
        idempotencyKey:
          occasion === null
            ? `notification:${kind}:${day.value}`
            : `notification:${kind}:${day.value}:${occasion}`,
        occurredAt: at,
        audience: AUDIENCE,
      },
    ]);
  }
}
