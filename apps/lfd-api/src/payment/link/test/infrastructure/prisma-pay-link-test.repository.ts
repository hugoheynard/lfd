import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../../platform/database/prisma.service.js";
import { currentTransaction } from "../../../../platform/database/transaction.store.js";
import { lockRow } from "../../../shared/infrastructure/row-lock.js";
import { PayLinkTestLockOutsideTransactionError } from "../domain/errors/pay-link-test-errors.js";
import type { PayLinkTest } from "../domain/pay-link-test.js";
import { PayLinkTestRepository } from "../domain/ports/pay-link-test.repository.js";
import { toDomain } from "./pay-link-test-rows.js";

/** La clé du verrou consultatif de l'envoi — une seule, pour tous les essais. */
const SENDING_LOCK = "payment.pay_link_test.sending";

/** Le fuseau du jour du plafond. */
const PARIS = "Europe/Paris";

/**
 * **Les essais**, dans `payment.pay_link_test` — l'écrivain UNIQUE de la
 * table. Passe par le client ambiant : sous une unité de travail, il écrit
 * dans la transaction de l'appelant. Les transitions et le montant sont
 * tenus aussi par la base (`20261124150100_le_lien_de_paiement_d_essai`).
 */
@Injectable()
export class PrismaPayLinkTestRepository extends PayLinkTestRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async add(test: PayLinkTest): Promise<void> {
    await this.prisma.payLinkTest.create({ data: test.toPersistence() });
  }

  async loadLocked(id: string): Promise<PayLinkTest | null> {
    if (currentTransaction() !== undefined) {
      await lockRow(this.prisma, "pay_link_test", id);
    }
    return this.load(id);
  }

  async load(id: string): Promise<PayLinkTest | null> {
    const row = await this.prisma.payLinkTest.findUnique({ where: { id } });
    return row === null ? null : toDomain(row);
  }

  async save(test: PayLinkTest): Promise<void> {
    const { id, state, paidAt, refundedAt } = test.toPersistence();
    await this.prisma.payLinkTest.update({ where: { id }, data: { state, paidAt, refundedAt } });
  }

  async lockSending(): Promise<void> {
    if (currentTransaction() === undefined) {
      throw new PayLinkTestLockOutsideTransactionError();
    }
    await this.prisma
      .$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${SENDING_LOCK}, 0))`;
  }

  async countSentOnParisDayOf(instant: Date): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS "count" FROM "payment"."pay_link_test"
       WHERE ("created_at" AT TIME ZONE ${PARIS})::date = (${instant}::timestamptz AT TIME ZONE ${PARIS})::date`;
    return Number(rows[0]?.count ?? 0n);
  }
}
