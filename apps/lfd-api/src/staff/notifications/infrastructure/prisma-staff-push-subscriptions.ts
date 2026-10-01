import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { StaffPushSubscriptions, type StaffPushTarget } from "../domain/ports/staff-push.js";

/**
 * Le registre des installations abonnées.
 *
 * `upsert` sur `endpoint` : un navigateur qui se réabonne — après une
 * réinstallation, ou une permission redonnée — porte le même endpoint et doit
 * **remplacer** sa ligne. Ses clés, elles, changent à chaque abonnement.
 */
@Injectable()
export class PrismaStaffPushSubscriptions extends StaffPushSubscriptions {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  async save(target: StaffPushTarget, staffUserId: string): Promise<void> {
    // La clé de routage (B5) : l'installation reçoit ce que son dernier
    // abonné a le droit de recevoir.
    await this.prisma.staffPushSubscription.upsert({
      where: { endpoint: target.endpoint },
      create: { id: this.ids.next(), ...target, staffUserId },
      update: { p256dh: target.p256dh, auth: target.auth, staffUserId },
    });
  }

  /** `deleteMany` et non `delete` : oublier deux fois n'est pas une erreur. */
  async forget(endpoint: string): Promise<void> {
    await this.prisma.staffPushSubscription.deleteMany({ where: { endpoint } });
  }

  /** 🔴 Le mur de la poussée : `staff_user_id IN (…)`, jamais toutes les lignes. */
  async ofStaff(staffUserIds: readonly string[]): Promise<readonly StaffPushTarget[]> {
    if (staffUserIds.length === 0) {
      return [];
    }
    return this.prisma.staffPushSubscription.findMany({
      where: { staffUserId: { in: [...staffUserIds] } },
      select: { endpoint: true, p256dh: true, auth: true },
    });
  }

  /** Un abonnement qui repasse est **guéri** : sa marque de refus s'efface. */
  async markSent(endpoints: readonly string[], at: Date): Promise<void> {
    if (endpoints.length === 0) {
      return;
    }
    await this.prisma.staffPushSubscription.updateMany({
      where: { endpoint: { in: [...endpoints] } },
      data: { lastSentAt: at, failingSince: null },
    });
  }

  /**
   * `failingSince: null` dans le `where` : on note le **début** du refus, pas
   * le dernier. Écraser la date à chaque envoi repousserait indéfiniment le
   * délai de grâce, et rien ne partirait jamais.
   */
  async markFailing(endpoints: readonly string[], since: Date): Promise<void> {
    if (endpoints.length === 0) {
      return;
    }
    await this.prisma.staffPushSubscription.updateMany({
      where: { endpoint: { in: [...endpoints] }, failingSince: null },
      data: { failingSince: since },
    });
  }

  async forgetFailingSince(before: Date): Promise<number> {
    const forgotten = await this.prisma.staffPushSubscription.deleteMany({
      where: { failingSince: { lt: before } },
    });
    return forgotten.count;
  }
}
