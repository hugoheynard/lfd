import type { StaffPermission } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import {
  currentRequestContext,
  runWithRequestContext,
} from "../../platform/context/request-context.store.js";
import { newTraceId } from "../../platform/context/trace-context.js";
import { BackgroundWork } from "../../platform/events/background-work.js";
import { Journal } from "../../platform/journal/journal.js";
import { Clock } from "../../platform/time/clock.js";
import { staffEntryRefusedFact, type StaffPerson } from "../directory/domain/staff-facts.js";
import { StaffInvitationExpiredError } from "../directory/domain/staff-user-errors.js";
import { StaffNotifier } from "../notifications/domain/ports/staff-notifier.js";

/** Ceux qui peuvent rouvrir l'accès : réinviter est un geste de `staff_access:write`. */
const AUDIENCE: StaffPermission = "staff_access:write";
const KIND = "staff.invitation_expired";
const RUNG = "staff-invitation-expired-bell";

/** Ce que le refus dit d'une fiche. */
export interface RefusedStaff extends StaffPerson {
  readonly id: string;
  readonly invitedAt: Date | null;
}

/**
 * **Le refus d'entrée d'une fiche dont l'invitation a expiré** (2026-10-10,
 * `architecture-compte-client-cycle-de-vie.md` §8.1 bis, point 8) : le fait
 * au journal, la cloche aux détenteurs de `staff_access:write`, puis l'erreur
 * nommée.
 *
 * Sorti du résolveur, qui dépassait déjà la taille d'un fichier : il décide,
 * ceci dit.
 */
@Injectable()
export class StaffEntryRefusal {
  constructor(
    private readonly journal: Journal,
    private readonly notifier: StaffNotifier,
    private readonly work: BackgroundWork,
    private readonly clock: Clock,
  ) {}

  /**
   * Le fait a la fiche pour auteur — c'est elle qui a tenté d'entrer, personne
   * d'autre n'a agi —, comme `staff_user.activated`. La cloche sonne une fois
   * par invitation : sa clé porte la date de la dernière.
   *
   * @throws {StaffInvitationExpiredError} toujours.
   */
  async refuse(fiche: RefusedStaff): Promise<never> {
    await this.asTheFiche(fiche.id, () =>
      this.journal.append(staffEntryRefusedFact(fiche.id, fiche)),
    );
    void this.work.track(this.ring(fiche), RUNG);
    throw new StaffInvitationExpiredError(fiche.id);
  }

  private async ring(fiche: RefusedStaff): Promise<void> {
    const who = `${fiche.firstName} ${fiche.lastName}`.trim() || "Un membre de l'équipe";
    await this.notifier.notify([
      {
        kind: KIND,
        subject: `Accès expiré — ${who}`,
        body:
          `${who} a tenté d'entrer avec une invitation expirée. ` +
          "Renvoyez-lui une invitation depuis l'annuaire de l'équipe.",
        link: "/admin/utilisateurs",
        idempotencyKey: `notification:${KIND}:${fiche.id}:${fiche.invitedAt?.toISOString() ?? "none"}`,
        occurredAt: this.clock.now(),
        audience: AUDIENCE,
      },
    ]);
  }

  private asTheFiche<T>(staffUserId: string, work: () => Promise<T>): Promise<T> {
    const context = currentRequestContext();
    return runWithRequestContext(
      {
        now: context?.now ?? this.clock.now(),
        traceId: context?.traceId ?? newTraceId(),
        actor: { type: "staff", id: staffUserId },
      },
      work,
    );
  }
}
