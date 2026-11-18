import { Injectable } from "@nestjs/common";

import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";
import { currentTransaction } from "../../../../platform/database/transaction.store.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { VatRateLock } from "../domain/ports/vat-rate.lock.js";

/** Le verrou demandé hors d'une unité de travail : un défaut de code, pas un refus. */
class LockOutsideTransactionError extends TechnicalError {
  constructor() {
    super(
      "pim.vat_rate.lock_outside_transaction",
      "Le verrou d'un taux de TVA a été demandé hors d'une unité de travail : il serait relâché aussitôt pris. Le geste n'a rien écrit ; signalez-le à l'équipe technique.",
    );
  }
}

/**
 * En SQL écrit à la main : Prisma n'exprime pas le verrou de ligne. Le client
 * est routé vers la transaction ambiante, et c'est elle qui donne au verrou sa
 * durée — celle du geste. Les taux sont pris dans l'ordre de leur identifiant :
 * deux poses qui en visent plusieurs les prennent dans le même ordre.
 */
@Injectable()
export class PrismaVatRateLock extends VatRateLock {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async forArchival(rateId: string): Promise<void> {
    this.requireTransaction();
    await this.prisma.$queryRaw`
      SELECT id FROM pim.tva_rate WHERE id = ${rateId} FOR UPDATE`;
  }

  async forUse(rateIds: readonly string[]): Promise<void> {
    if (rateIds.length === 0) {
      return;
    }
    this.requireTransaction();
    await this.prisma.$queryRaw`
      SELECT id FROM pim.tva_rate WHERE id = ANY(${[...rateIds]}::text[]) ORDER BY id FOR SHARE`;
  }

  private requireTransaction(): void {
    if (currentTransaction() === undefined) {
      throw new LockOutsideTransactionError();
    }
  }
}
