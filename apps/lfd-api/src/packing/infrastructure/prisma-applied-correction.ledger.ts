import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  AppliedCorrectionLedger,
  CorrectionCatchUpDays,
  type CorrectedReceipt,
  HandoffReceipts,
} from "../domain/ports/applied-correction.ledger.js";

/** Le registre des corrections appliquées, sur `packing_applied_correction`. */
@Injectable()
export class PrismaAppliedCorrectionLedger extends AppliedCorrectionLedger {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async appliedOf(receipt: CorrectedReceipt): Promise<number> {
    const row = await this.prisma.packingAppliedCorrection.findUnique({
      where: { serviceDay_handoffId_sku: receipt },
      select: { applied: true },
    });
    return row?.applied ?? 0;
  }

  /** `GREATEST` : un total plus bas qu'en base ne la fait jamais redescendre. */
  async record(receipt: CorrectedReceipt, applied: number): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO "packing"."packing_applied_correction" ("service_day", "handoff_id", "sku", "applied")
      VALUES (${receipt.serviceDay}, ${receipt.handoffId}, ${receipt.sku}, ${applied})
      ON CONFLICT ("service_day", "handoff_id", "sku") DO UPDATE
         SET "applied" = GREATEST("packing"."packing_applied_correction"."applied", EXCLUDED."applied")`;
  }
}

/** La remise est reçue quand son reçu `handoff` est posé (`packing_receipt`). */
@Injectable()
export class PrismaHandoffReceipts extends HandoffReceipts {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isReceived(handoffId: string): Promise<boolean> {
    const count = await this.prisma.packingReceipt.count({
      where: { id: handoffId, kind: "handoff" },
    });
    return count > 0;
  }
}

/** Les journées à remises reçues, à partir d'un jour, sans doublon. */
@Injectable()
export class PrismaCorrectionCatchUpDays extends CorrectionCatchUpDays {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async daysWithHandoffsFrom(firstDay: string): Promise<readonly string[]> {
    const rows = await this.prisma.packingReceipt.findMany({
      where: { kind: "handoff", serviceDay: { gte: firstDay } },
      select: { serviceDay: true },
      distinct: ["serviceDay"],
      orderBy: { serviceDay: "asc" },
    });
    return rows.map((row) => row.serviceDay);
  }
}
