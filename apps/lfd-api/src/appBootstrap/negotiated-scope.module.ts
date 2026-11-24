import { Global, Module } from "@nestjs/common";

import { NegotiatedScope } from "../lafoliecoffee/orders/domain/ports/negotiated-scope.js";
import { PricingNegotiatedScope } from "../lafoliecoffee/pricing/application/negotiated-scope.js";
import { PricingModule } from "../lafoliecoffee/pricing/pricing.module.js";

/**
 * **Le tarif convenu** (plan `plan-clients-publics-chorus.md`, § 6 sexies,
 * QD8). La commande déclare le port, la tarification l'implémente sur la
 * mercuriale ; le moment de l'engagement se lit par
 * `PayerCommitmentRequirements` (`PayerCommitmentRequirementsModule`). La
 * liaison vit ici pour que ni l'une ni l'autre ne câble l'autre.
 */
@Global()
@Module({
  imports: [PricingModule],
  providers: [{ provide: NegotiatedScope, useClass: PricingNegotiatedScope }],
  exports: [NegotiatedScope],
})
export class NegotiatedScopeModule {}
