import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { currentTransaction } from "../../../platform/database/transaction.store.js";
import { RecapNumberingOutsideTransactionError } from "../domain/errors/in-house-recap-errors.js";
import { RecapNumbering } from "../domain/ports/recap-numbering.js";
import type { RecapMonth } from "../domain/value-objects/recap-month.js";

/** La largeur du rang dans le numéro. */
const RANK_WIDTH = 4;

/**
 * Le rang d'un récapitulatif dans son mois, sous un verrou consultatif de
 * transaction : deux émissions concurrentes du même mois s'attendent, et un
 * `ROLLBACK` ne laisse pas de trou. L'unicité de `number` reste le filet.
 */
@Injectable()
export class PrismaRecapNumbering extends RecapNumbering {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async next(month: RecapMonth): Promise<string> {
    if (currentTransaction() === undefined) {
      throw new RecapNumberingOutsideTransactionError();
    }
    const lockKey = `in_house_recap_number:${month.key}`;
    await this.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const issued = await this.prisma.inHouseRecap.count({ where: { month: month.key } });
    const rank = String(issued + 1).padStart(RANK_WIDTH, "0");
    return `RBL-${month.key.replace("-", "")}-${rank}`;
  }
}
