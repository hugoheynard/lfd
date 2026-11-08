import { Global, Module } from "@nestjs/common";

import { MarketingConsent } from "../channels/marketing/marketing-consent.js";
import { BlockMarketingConsent } from "./application/block-marketing-consent.js";
import { EraseMarketingPreferencesHandler } from "./application/commands/erase-marketing-preferences.handler.js";
import { UnsubscribeByTokenHandler } from "./application/commands/unsubscribe-by-token.handler.js";
import { MarketingAddresses } from "./application/services/marketing-addresses.js";
import { MarketingUnsubscriber } from "./application/services/marketing-unsubscriber.js";
import { UnsubscribeLinks } from "./application/services/unsubscribe-links.js";
import { AddressPrint } from "./domain/ports/address-print.js";
import { MarketingPreferenceReader } from "./domain/ports/marketing-preference.reader.js";
import { MarketingPreferenceRepository } from "./domain/ports/marketing-preference.repository.js";
import { SpacePublicOrigins } from "./domain/ports/space-public-origins.js";
import { UnsubscribeTokens } from "./domain/ports/unsubscribe-tokens.js";
import { UnsubscribeController } from "./http/unsubscribe.controller.js";
import { AesGcmUnsubscribeTokens } from "./infrastructure/aes-gcm-unsubscribe-tokens.js";
import { ConfigSpacePublicOrigins } from "./infrastructure/config-space-public-origins.js";
import { HmacAddressPrint } from "./infrastructure/hmac-address-print.js";
import { PrismaMarketingPreferenceReader } from "./infrastructure/prisma-marketing-preference.reader.js";
import { PrismaMarketingPreferenceRepository } from "./infrastructure/prisma-marketing-preference.repository.js";

/**
 * **Le registre de préférence marketing et la désinscription** (plan
 * `documentation/mail/plan-desinscription-des-e-mails.md`, lot U2) : le
 * registre, le jeton, les deux routes publiques, et le canal
 * `MarketingConsent`.
 *
 * **Global**, comme `MailModule` : un bloc métier n'importe que le canal
 * (`mail/channels/marketing/`), jamais ce module. `UnsubscribeLinks` est
 * exporté pour le rendu des e-mails marketing (U3), dans le bloc.
 */
@Global()
@Module({
  controllers: [UnsubscribeController],
  providers: [
    { provide: MarketingPreferenceRepository, useClass: PrismaMarketingPreferenceRepository },
    { provide: MarketingPreferenceReader, useClass: PrismaMarketingPreferenceReader },
    { provide: AddressPrint, useClass: HmacAddressPrint },
    { provide: UnsubscribeTokens, useClass: AesGcmUnsubscribeTokens },
    { provide: SpacePublicOrigins, useClass: ConfigSpacePublicOrigins },
    MarketingAddresses,
    MarketingUnsubscriber,
    UnsubscribeLinks,
    UnsubscribeByTokenHandler,
    EraseMarketingPreferencesHandler,
    { provide: MarketingConsent, useClass: BlockMarketingConsent },
  ],
  exports: [MarketingConsent, UnsubscribeLinks],
})
export class MailMarketingModule {}
