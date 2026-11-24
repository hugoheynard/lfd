import { Global, Module } from "@nestjs/common";

import { PayerLiveMercurialeReader } from "../lafoliecoffee/account/domain/ports/payer-live-mercuriale.reader.js";
import { PayerUninvoicedOrdersReader } from "../lafoliecoffee/account/domain/ports/payer-uninvoiced-orders.reader.js";
import { PrismaPayerUninvoicedOrdersReader } from "../lafoliecoffee/accounting/infrastructure/prisma-payer-uninvoiced-orders.reader.js";
import { PricingPayerLiveMercuriale } from "../lafoliecoffee/pricing/application/payer-live-mercuriale.js";
import { PricingModule } from "../lafoliecoffee/pricing/pricing.module.js";

/**
 * **Le moment de l'engagement** sur la fiche Chorus (plan
 * `plan-clients-publics-chorus.md`, § 6 sexies, QD1). `account` déclare les
 * deux lectures ; la tarification dit si une mercuriale agit, la
 * comptabilité si une commande attend sa facture. La liaison vit ici pour
 * qu'`account` n'importe ni l'une ni l'autre.
 */
@Global()
@Module({
  imports: [PricingModule],
  providers: [
    { provide: PayerLiveMercurialeReader, useClass: PricingPayerLiveMercuriale },
    { provide: PayerUninvoicedOrdersReader, useClass: PrismaPayerUninvoicedOrdersReader },
  ],
  exports: [PayerLiveMercurialeReader, PayerUninvoicedOrdersReader],
})
export class CommitmentTimingModule {}
