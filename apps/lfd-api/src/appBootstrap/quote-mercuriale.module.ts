import { Global, Module } from "@nestjs/common";

import { QuoteMercurialeReader } from "../lafoliecoffee/accounting/domain/ports/quote-mercuriale.reader.js";
import { PricingQuoteMercurialeReader } from "../lafoliecoffee/pricing/application/quote-mercuriale.js";
import { PricingModule } from "../lafoliecoffee/pricing/pricing.module.js";

/**
 * **La mercuriale citée par le devis de période** (plan
 * `plan-clients-publics-chorus.md`, § 6 sexies, QD4). La comptabilité
 * déclare le port, la tarification l'implémente ; la liaison vit ici pour
 * que ni l'une ni l'autre ne câble l'autre.
 */
@Global()
@Module({
  imports: [PricingModule],
  providers: [{ provide: QuoteMercurialeReader, useClass: PricingQuoteMercurialeReader }],
  exports: [QuoteMercurialeReader],
})
export class QuoteMercurialeModule {}
