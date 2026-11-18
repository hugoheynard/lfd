import { Injectable } from "@nestjs/common";

import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";
import { currentTransaction } from "../../../../platform/database/transaction.store.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { SalesContextLock } from "../domain/ports/sales-context.lock.js";

/** Le verrou demandé hors d'une unité de travail : un défaut de code, pas un refus. */
class LockOutsideTransactionError extends TechnicalError {
  constructor() {
    super(
      "pim.sales_context.lock_outside_transaction",
      "Le verrou d'un contexte de vente a été demandé hors d'une unité de travail : il serait relâché aussitôt pris. Le geste n'a rien écrit ; signalez-le à l'équipe technique.",
    );
  }
}

/**
 * En SQL écrit à la main : Prisma n'exprime pas le verrou de ligne. Le client
 * est routé vers la transaction ambiante, et c'est elle qui donne au verrou sa
 * durée — celle du geste. Les contextes sont pris dans l'ordre de leur clé.
 */
@Injectable()
export class PrismaSalesContextLock extends SalesContextLock {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async forArchival(key: string): Promise<void> {
    this.requireTransaction();
    await this.prisma.$queryRaw`
      SELECT id FROM pim.sales_context WHERE key = ${key} FOR UPDATE`;
  }

  async forUse(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }
    this.requireTransaction();
    await this.prisma.$queryRaw`
      SELECT id FROM pim.sales_context WHERE key = ANY(${[...keys]}::text[]) ORDER BY key FOR SHARE`;
  }

  private requireTransaction(): void {
    if (currentTransaction() === undefined) {
      throw new LockOutsideTransactionError();
    }
  }
}
