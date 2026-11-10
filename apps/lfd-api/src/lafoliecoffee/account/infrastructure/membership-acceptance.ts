import type { StaffPermission } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { BackgroundWork } from "../../../platform/events/background-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { oldestLiveInvitation } from "../../../platform/shared/invitation/invitation-expiry.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffNotifier } from "../../../staff/notifications/domain/ports/staff-notifier.js";
import { InvitationExpiredError } from "../domain/errors/invitation-errors.js";
import { personName } from "../domain/events/journal-names.js";
import { EntryRefusedOnExpiredInvitationEvent } from "../domain/events/person-acts.event.js";

/** Ceux qui peuvent faire le geste de sortie : remettre un lien depuis la fiche d'une société. */
const AUDIENCE: StaffPermission = "b2b_companies:write";
const KIND = "account.invitation_expired";
const RUNG = "account-invitation-expired-bell";

/**
 * **L'entrée d'une personne par ses rattachements** (2026-10-10,
 * `architecture-compte-client-cycle-de-vie.md` §8.1 bis, points 2 et 6).
 *
 * Deux gestes, partagés par les deux chemins d'entrée — le `sub` connu
 * (`CustomerPrincipalResolver.record`) et le `sub` inconnu
 * (`UnknownSubjectAdmission.claim`) :
 *
 * - {@link acceptLive} accepte les rattachements dont l'invitation vit, et la
 *   règle est dans le `WHERE` de l'`UPDATE` (`invited_at >= borne`) : une
 *   invitation expirée entre la lecture et l'écriture n'est pas acceptée ;
 * - {@link refuse} dit le refus : un fait au journal, une cloche aux
 *   commerciaux, puis l'erreur nommée.
 */
@Injectable()
export class MembershipAcceptance {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventPublisher,
    private readonly notifier: StaffNotifier,
    private readonly work: BackgroundWork,
    private readonly clock: Clock,
  ) {}

  /**
   * Pose `accepted_at` sur les rattachements non acceptés dont l'invitation
   * vit à `now`. Dans la transaction de l'appelant s'il y en a une.
   *
   * @returns le nombre de rattachements acceptés par CETTE écriture.
   */
  async acceptLive(userId: string, now: Date): Promise<number> {
    const { count } = await this.prisma.membership.updateMany({
      where: { userId, acceptedAt: null, invitedAt: { gte: oldestLiveInvitation(now) } },
      data: { acceptedAt: now },
    });
    return count;
  }

  /**
   * Refuse l'entrée de cette personne : le fait, la cloche, puis l'erreur.
   *
   * La cloche part en tâche de fond (un envoi raté ne change rien au refus)
   * et sonne une fois par invitation : sa clé porte la date de la dernière
   * invitation, si bien qu'une personne qui réessaie dix fois ne sonne qu'une
   * fois, et qu'un lien neuf puis expiré sonne de nouveau.
   *
   * @throws {InvitationExpiredError} toujours.
   */
  async refuse(userId: string): Promise<never> {
    const person = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName: true,
        memberships: {
          where: { acceptedAt: null },
          orderBy: { invitedAt: "desc" },
          take: 1,
          select: {
            companyId: true,
            invitedAt: true,
            company: { select: { enseigne: true, raisonSociale: true } },
          },
        },
      },
    });
    const name = person === null ? null : personName(person.firstName, person.lastName);
    await this.events.publishTraced(new EntryRefusedOnExpiredInvitationEvent(userId, name));
    const [latest] = person?.memberships ?? [];
    void this.work.track(this.ring(userId, name, latest), RUNG);
    throw new InvitationExpiredError(userId);
  }

  private async ring(
    userId: string,
    name: string | null,
    latest: ExpiredMembership | undefined,
  ): Promise<void> {
    const who = name ?? "Une personne invitée";
    const where = latest === undefined ? "" : ` chez ${companyLabel(latest.company)}`;
    await this.notifier.notify([
      {
        kind: KIND,
        subject: `Invitation expirée — ${who}`,
        body:
          `${who} a tenté d'entrer${where} avec une invitation expirée. ` +
          "Remettez-lui un lien depuis la fiche de la société.",
        link:
          latest === undefined ? "/admin/acces-en-attente" : `/comptes-clients/${latest.companyId}`,
        idempotencyKey: `notification:${KIND}:${userId}:${latest?.invitedAt.toISOString() ?? "none"}`,
        occurredAt: this.clock.now(),
        audience: AUDIENCE,
      },
    ]);
  }
}

interface ExpiredMembership {
  readonly companyId: string;
  readonly invitedAt: Date;
  readonly company: { readonly enseigne: string; readonly raisonSociale: string };
}

/** Le nom d'USAGE de la société, celui sous lequel le commercial la reconnaît. */
function companyLabel(company: ExpiredMembership["company"]): string {
  return company.enseigne.trim() === "" ? company.raisonSociale : company.enseigne;
}
