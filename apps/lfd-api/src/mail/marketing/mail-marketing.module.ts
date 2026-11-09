import { Global, Module } from "@nestjs/common";

import { MarketingConsent } from "../channels/marketing/marketing-consent.js";
import { MarketingClearance } from "../requests/domain/ports/marketing-clearance.js";
import { BlockMarketingConsent } from "./application/block-marketing-consent.js";
import { ConfirmConsentByTokenHandler } from "./application/commands/confirm-consent-by-token.handler.js";
import { EraseMarketingPreferencesHandler } from "./application/commands/erase-marketing-preferences.handler.js";
import { UnsubscribeByTokenHandler } from "./application/commands/unsubscribe-by-token.handler.js";
import { ConsentConfirmationMailer } from "./application/services/consent-confirmation-mailer.js";
import { ConsentConfirmLinks } from "./application/services/consent-confirm-links.js";
import { MarketingAddressMover } from "./application/services/marketing-address-mover.js";
import { MarketingAddresses } from "./application/services/marketing-addresses.js";
import { MarketingConsentRequester } from "./application/services/marketing-consent-requester.js";
import { MarketingUnsubscriber } from "./application/services/marketing-unsubscriber.js";
import { PreferenceMarketingClearance } from "./application/services/preference-marketing-clearance.js";
import { UnsubscribeLinks } from "./application/services/unsubscribe-links.js";
import { AddressPrint } from "./domain/ports/address-print.js";
import { MarketingGroup } from "./domain/services/marketing-group.js";
import { ConsentConfirmTokens } from "./domain/ports/consent-confirm-tokens.js";
import { MarketingPreferenceReader } from "./domain/ports/marketing-preference.reader.js";
import { MarketingPreferenceRepository } from "./domain/ports/marketing-preference.repository.js";
import { PendingConsentPruner } from "./domain/ports/pending-consent.pruner.js";
import { SpacePublicOrigins } from "./domain/ports/space-public-origins.js";
import { UnsubscribeTokens } from "./domain/ports/unsubscribe-tokens.js";
import { ConsentConfirmController } from "./http/consent-confirm.controller.js";
import { UnsubscribeController } from "./http/unsubscribe.controller.js";
import { NewsletterController } from "./http/newsletter.controller.js";
import { SubscribeNewsletterHandler } from "./application/commands/subscribe-newsletter.handler.js";
import { AesGcmConsentConfirmTokens } from "./infrastructure/aes-gcm-consent-confirm-tokens.js";
import { AesGcmUnsubscribeTokens } from "./infrastructure/aes-gcm-unsubscribe-tokens.js";
import { ConfigSpacePublicOrigins } from "./infrastructure/config-space-public-origins.js";
import { HmacAddressPrint } from "./infrastructure/hmac-address-print.js";
import { PrismaMarketingPreferenceReader } from "./infrastructure/prisma-marketing-preference.reader.js";
import { PrismaMarketingPreferenceRepository } from "./infrastructure/prisma-marketing-preference.repository.js";
import { PrismaPendingConsentPruner } from "./infrastructure/prisma-pending-consent.pruner.js";

/**
 * **Le registre de préférence marketing et la désinscription** (plan
 * `documentation/mail/plan-desinscription-des-e-mails.md`, lots U2, U3, C1) :
 * le registre, les jetons, les routes publiques (désinscrire, confirmer un
 * accord), le contrôle à l'envoi, et le canal `MarketingConsent`.
 *
 * **Global**, comme `MailModule` : un bloc métier n'importe que le canal
 * (`mail/channels/marketing/`), jamais ce module. `UnsubscribeLinks` est
 * exporté pour le rendu des e-mails marketing (U3), dans le bloc.
 */
@Global()
@Module({
  controllers: [UnsubscribeController, ConsentConfirmController, NewsletterController],
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
    // C1 : la demande d'accord, sa double confirmation, et la purge des
    // demandes jamais confirmées (lue par la purge du suivi, sous son cran).
    { provide: ConsentConfirmTokens, useClass: AesGcmConsentConfirmTokens },
    { provide: PendingConsentPruner, useClass: PrismaPendingConsentPruner },
    ConsentConfirmLinks,
    ConsentConfirmationMailer,
    MarketingConsentRequester,
    ConfirmConsentByTokenHandler,
    // C2, C3 : le déménagement d'adresse, et le groupe (« partenaires », éteint).
    MarketingAddressMover,
    { provide: MarketingGroup, useValue: new MarketingGroup() },
    { provide: MarketingConsent, useClass: BlockMarketingConsent },
    // C5 : la lettre du pied de page de la boutique.
    SubscribeNewsletterHandler,
    // U3 : le contrôle à l'envoi, lu par l'essai d'envoi de `MailModule`.
    { provide: MarketingClearance, useClass: PreferenceMarketingClearance },
  ],
  exports: [
    MarketingConsent,
    UnsubscribeLinks,
    MarketingClearance,
    PendingConsentPruner,
    // C4 : le registre vu par le staff (`MailMarketingAdminModule`) désinscrit
    // par la même écriture que la page et le canal.
    MarketingPreferenceRepository,
    MarketingAddresses,
    MarketingUnsubscriber,
  ],
})
export class MailMarketingModule {}
