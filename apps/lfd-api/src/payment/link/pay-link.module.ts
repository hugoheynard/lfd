import { Global, Module } from "@nestjs/common";

import { PayLinks } from "../channels/requests/pay-links.js";
import { BlockPayLinks } from "./application/block-pay-links.js";
import { StartPayLinkPaymentHandler } from "./application/commands/start-pay-link-payment.handler.js";
import { LivePayLinkLookup } from "./application/live-pay-link-lookup.js";
import { ViewPayLinkHandler } from "./application/queries/view-pay-link.handler.js";
import { FirstCardPaymentReader } from "./domain/ports/first-card-payment.reader.js";
import { PayLinkOrigins } from "./domain/ports/pay-link-origins.js";
import { PayLinkTokenVault } from "./domain/ports/pay-link-token-vault.js";
import { PayLinkRepository } from "./domain/ports/pay-link.repository.js";
import { TokenGenerator } from "./domain/ports/token-generator.js";
import { PayLinksController } from "./http/pay-links.controller.js";
import { ConfiguredPayLinkOrigins } from "./infrastructure/configured-pay-link-origins.js";
import { HmacPayLinkTokenVault } from "./infrastructure/hmac-pay-link-token-vault.js";
import { PrismaPayLinkRepository } from "./infrastructure/prisma-pay-link.repository.js";
import { RandomTokenGenerator } from "./infrastructure/random-token-generator.js";
import { SettlementFirstCardPaymentReader } from "./infrastructure/settlement-first-card-payment.reader.js";

/**
 * **Les liens de paiement vers un sujet** (plan
 * `documentation/comptabilite/liens-de-paiement/plan-le-lien-vers-un-sujet.md`,
 * §2) : la table `payment.pay_link`, la porte `PayLinks` et la page
 * publique.
 *
 * **Global**, comme `CardPaymentModule` : un bloc métier n'atteint que le
 * canal (`payment/channels/requests/`). Le jeton `LinkableSubjects` n'est pas
 * fourni ici : la racine de composition le pose
 * (`appBootstrap/pay-link-feed.module.ts`), seule à connaître les blocs qui
 * possèdent un sujet payable par lien.
 */
@Global()
@Module({
  controllers: [PayLinksController],
  providers: [
    { provide: PayLinkRepository, useClass: PrismaPayLinkRepository },
    { provide: PayLinkOrigins, useClass: ConfiguredPayLinkOrigins },
    { provide: PayLinkTokenVault, useClass: HmacPayLinkTokenVault },
    { provide: TokenGenerator, useClass: RandomTokenGenerator },
    { provide: FirstCardPaymentReader, useClass: SettlementFirstCardPaymentReader },
    { provide: PayLinks, useClass: BlockPayLinks },
    LivePayLinkLookup,
    ViewPayLinkHandler,
    StartPayLinkPaymentHandler,
  ],
  exports: [PayLinks],
})
export class PayLinkModule {}
