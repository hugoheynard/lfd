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

  async save(target: StaffPushTarget, staffSub: string): Promise<void> {
    await this.prisma.staffPushSubscription.upsert({
      where: { endpoint: target.endpoint },
      create: { id: this.ids.next(), ...target, staffSub },
      update: { p256dh: target.p256dh, auth: target.auth, staffSub },
    });
  }

  /** `deleteMany` et non `delete` : oublier deux fois n'est pas une erreur. */
  async forget(endpoint: string): Promise<void> {
    await this.prisma.staffPushSubscription.deleteMany({ where: { endpoint } });
  }

  async all(): Promise<readonly StaffPushTarget[]> {
    return this.prisma.staffPushSubscription.findMany({
      select: { endpoint: true, p256dh: true, auth: true },
    });
  }

  async markSent(endpoints: readonly string[], at: Date): Promise<void> {
    if (endpoints.length === 0) {
      return;
    }
    await this.prisma.staffPushSubscription.updateMany({
      where: { endpoint: { in: [...endpoints] } },
      data: { lastSentAt: at },
    });
  }
}
