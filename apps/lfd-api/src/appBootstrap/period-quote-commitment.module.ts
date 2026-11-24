import { Global, Module } from "@nestjs/common";

import { AccountingModule } from "../lafoliecoffee/accounting/accounting.module.js";
import { QuotedOrdersCommitment } from "../lafoliecoffee/accounting/domain/ports/quoted-orders-commitment.js";
import { PrismaQuotedOrdersReader } from "../lafoliecoffee/accounting/infrastructure/prisma-quoted-orders.reader.js";
import { QuotedCommitmentAccepting } from "../lafoliecoffee/orders/application/services/quoted-commitment-accepting.js";
import { QuotedOrdersReader } from "../lafoliecoffee/orders/domain/ports/quoted-orders.reader.js";
import { OrdersModule } from "../lafoliecoffee/orders/orders.module.js";

/**
 * **Le numéro d'engagement d'un devis de période** (plan
 * `plan-clients-publics-chorus.md`, § 6 sexies, QD2 et QD6), dans les deux
 * sens :
 *
 * - la comptabilité déclare `QuotedOrdersCommitment` (« écris ce numéro sur
 *   les commandes du devis »), la commande l'implémente — elle possède
 *   `orders` et la règle (`acceptQuoted`) ;
 * - la commande déclare `QuotedOrdersReader` (« cette commande est-elle dans
 *   un devis en attente ? »), la comptabilité l'implémente — elle possède
 *   `period_quote_order`.
 *
 * La liaison vit ici pour que ni l'une ni l'autre ne câble l'autre.
 */
@Global()
@Module({
  imports: [AccountingModule, OrdersModule],
  providers: [
    { provide: QuotedOrdersCommitment, useExisting: QuotedCommitmentAccepting },
    { provide: QuotedOrdersReader, useExisting: PrismaQuotedOrdersReader },
  ],
  exports: [QuotedOrdersCommitment, QuotedOrdersReader],
})
export class PeriodQuoteCommitmentModule {}
