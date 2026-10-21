import type { StaffPermission } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { AfterCommit } from "../../../platform/database/after-commit.js";
import { BackgroundWork } from "../../../platform/events/background-work.js";
import { StaffNotifier } from "../../../staff/notifications/domain/ports/staff-notifier.js";
import type { SiteResupply } from "../domain/site-resupply.js";

/**
 * Qui reçoit : le comptoir. La cloche ne sait adresser qu'un DROIT, jamais un
 * point (`StaffNotice.audience`, vérifié le 2026-10-22) : tout le personnel
 * qui tient `handover_counter:read` l'entend, quel que soit son point — le
 * nom du point est donc dans le titre.
 */
const AUDIENCE: StaffPermission = "handover_counter:read";

export const RESUPPLY_ARRIVED_NOTICE = "resupply.arrived";
const RUNG = "resupply-arrived-bell";

/** La page où l'on réceptionne. */
const RECEPTION_LINK = "/comptoir/reassort";

/**
 * **« Réassort arrivé — à réceptionner »** (lot R3e de
 * `reassort-boutiques/plan-reapprovisionnement.md`) : le même son pour les
 * deux chemins — la réception du transfert, « Monté » au fournil.
 *
 * Sonne APRÈS la validation (`AfterCommit`) : une arrivée annulée ne
 * prévient personne. Une clé par réassort : un fait rejoué ne sonne pas
 * deux fois. Un envoi qui échoue est journalisé par `BackgroundWork`.
 */
@Injectable()
export class ResupplyArrivedBell {
  constructor(
    private readonly notifier: StaffNotifier,
    private readonly afterCommit: AfterCommit,
    private readonly work: BackgroundWork,
  ) {}

  ring(resupply: SiteResupply, siteLabel: string | null, at: Date): void {
    const notice = {
      kind: RESUPPLY_ARRIVED_NOTICE,
      ...resupplyArrivedWords(resupply, siteLabel),
      link: RECEPTION_LINK,
      idempotencyKey: `notification:${RESUPPLY_ARRIVED_NOTICE}:${resupply.id}`,
      occurredAt: at,
      audience: AUDIENCE,
    };
    this.afterCommit.defer(() => this.work.track(this.notifier.notify([notice]), RUNG), RUNG);
  }
}

/**
 * Les mots de la cloche : « Réassort arrivé — à réceptionner », le nom (R1g)
 * et le point quand ils sont connus, puis le compte des pièces.
 */
export function resupplyArrivedWords(
  resupply: SiteResupply,
  siteLabel: string | null,
): { readonly subject: string; readonly body: string } {
  const who = [resupply.name, siteLabel].filter((part): part is string => part !== null);
  const pieces = resupply.lines.reduce((sum, line) => sum + line.quantity, 0);
  const articles = resupply.lines.length;
  return {
    subject:
      who.length === 0
        ? "Réassort arrivé — à réceptionner"
        : `Réassort arrivé — à réceptionner : ${who.join(" — ")}`,
    body:
      `${String(pieces)} pièce${pieces > 1 ? "s" : ""} sur ${String(articles)} ` +
      `article${articles > 1 ? "s" : ""}. Comptez-les et réceptionnez depuis Comptoir › Réassort boutique.`,
  };
}
