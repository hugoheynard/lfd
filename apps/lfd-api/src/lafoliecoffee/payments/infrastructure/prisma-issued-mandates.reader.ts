import { Injectable } from "@nestjs/common";

import {
  IssuedMandatesReader,
  type IssuedMandatesUsage,
} from "../../accounting/domain/ports/issued-mandates.reader.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";

/**
 * Adaptateur du port que la comptabilité déclare, **rangé côté `payments`**
 * parce que c'est lui qui possède `payment_mandates` — même raison que
 * `PrismaDebtorMandateReader`.
 *
 * Trois `count` plutôt qu'un `groupBy` : deux schémas connus, et un compte à
 * zéro doit rester un zéro, là où un regroupement omettrait la ligne.
 */
@Injectable()
export class PrismaIssuedMandatesReader extends IssuedMandatesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async usageOf(creditorId: string): Promise<IssuedMandatesUsage> {
    const [core, b2b, drafts] = await Promise.all([
      this.prisma.paymentMandate.count({ where: { creditorId, status: "active", scheme: "CORE" } }),
      this.prisma.paymentMandate.count({ where: { creditorId, status: "active", scheme: "B2B" } }),
      this.prisma.paymentMandate.count({ where: { creditorId, status: "draft" } }),
    ]);
    return { activeByScheme: { CORE: core, B2B: b2b }, drafts };
  }
}
