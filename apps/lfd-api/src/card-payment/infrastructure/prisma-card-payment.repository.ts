import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { currentTransaction } from "../../platform/database/transaction.store.js";
import type { CardPayment } from "../domain/entities/card-payment.js";
import { CardPaymentRepository } from "../domain/ports/card-payment.repository.js";
import type { PaymentAccount } from "../domain/value-objects/payment-account.js";
import { toDomain } from "./card-payment-rows.js";

/** Les états d'un paiement pas encore réglé. */
const UNSETTLED = ["pending", "failed"] as const;

/**
 * **Les paiements**, dans le schéma `card_payment` — l'écrivain UNIQUE de la
 * table (`lint:prisma-model-ownership`). Passe par le client ambiant : sous
 * une unité de travail, il écrit dans la transaction de l'appelant.
 *
 * Les gardes que la base porte en plus (le `CHECK` des comptes, l'index d'un
 * seul `first` par sujet, le déclencheur des transitions et des colonnes
 * immuables) sont dans la migration `20261109030000_…` : un `save` qui les
 * franchirait échouerait, et c'est voulu.
 */
@Injectable()
export class PrismaCardPaymentRepository extends CardPaymentRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(paymentId: string): Promise<CardPayment | null> {
    if (currentTransaction() !== undefined) {
      // Le verrou d'abord, la lecture ensuite : un second webhook attend le
      // premier, puis relit la ligne écrite (§3.6).
      await this.prisma.$queryRaw`
        SELECT "id" FROM "card_payment"."payment" WHERE "id" = ${paymentId} FOR UPDATE`;
    }
    const row = await this.prisma.cardPayment.findUnique({ where: { id: paymentId } });
    return row === null ? null : toDomain(row);
  }

  async findByProviderRef(
    account: PaymentAccount,
    providerRef: string,
  ): Promise<CardPayment | null> {
    const row = await this.prisma.cardPayment.findUnique({
      where: { account_providerRef: { account: account.name, providerRef } },
    });
    return row === null ? null : toDomain(row);
  }

  async unsettledCreatedBefore(subjectType: string, before: Date): Promise<readonly CardPayment[]> {
    const rows = await this.prisma.cardPayment.findMany({
      where: { subjectType, state: { in: [...UNSETTLED] }, createdAt: { lt: before } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toDomain);
  }

  /**
   * `skipDuplicates` (`ON CONFLICT DO NOTHING`, sans cible : toutes les
   * contraintes d'unicité, l'index partiel du `first` compris) plutôt qu'un
   * `create` rattrapé : une violation annulerait la transaction de l'appelant.
   */
  async addIfAbsent(payment: CardPayment): Promise<boolean> {
    const { count } = await this.prisma.cardPayment.createMany({
      data: [payment.toPersistence()],
      skipDuplicates: true,
    });
    return count === 1;
  }

  /** Seuls l'état et l'instant d'encaissement bougent : le reste est immuable (déclencheur). */
  async save(payment: CardPayment): Promise<void> {
    const row = payment.toPersistence();
    await this.prisma.cardPayment.upsert({
      where: { id: row.id },
      create: row,
      update: { state: row.state, paidAt: row.paidAt },
    });
  }
}
