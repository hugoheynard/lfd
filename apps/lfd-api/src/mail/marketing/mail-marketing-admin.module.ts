import { Module } from "@nestjs/common";

import { MailSendsModule } from "../sends/mail-sends.module.js";
import { RevealMarketingPreferenceRecipientHandler } from "./application/commands/reveal-marketing-preference-recipient.handler.js";
import { UnsubscribeAddressByStaffHandler } from "./application/commands/unsubscribe-address-by-staff.handler.js";
import { UnsubscribeMarketingPreferenceHandler } from "./application/commands/unsubscribe-marketing-preference.handler.js";
import { GetMarketingPreferenceRecipientHandler } from "./application/queries/get-marketing-preference-recipient.handler.js";
import { GetMarketingPreferenceHandler } from "./application/queries/get-marketing-preference.handler.js";
import { ListMarketingPreferencesHandler } from "./application/queries/list-marketing-preferences.handler.js";
import { SearchMarketingPreferencesHandler } from "./application/commands/search-marketing-preferences.handler.js";
import { GetMarketingPreferenceSearchHandler } from "./application/queries/get-marketing-preference-search.handler.js";
import { PreferenceConsultationLedger } from "./domain/ports/preference-consultation.ledger.js";
import { PreferenceConsultationsRepository } from "./domain/ports/preference-consultations.repository.js";
import { PrismaPreferenceConsultationLedger } from "./infrastructure/prisma-preference-consultation.ledger.js";
import { PrismaPreferenceConsultationsRepository } from "./infrastructure/prisma-preference-consultations.repository.js";
import { MarketingPreferenceAdminReader } from "./domain/ports/marketing-preference-admin.reader.js";
import { AdminMarketingPreferencesController } from "./http/admin-marketing-preferences.controller.js";
import { PrismaMarketingPreferenceAdminReader } from "./infrastructure/prisma-marketing-preference-admin.reader.js";

/**
 * **Les désinscriptions et accords, vus par le staff** (plan
 * `documentation/mail/plan-desinscription-des-e-mails.md`, règle 8, lot C4),
 * sous le droit `mail_sends`. Le registre et sa désinscription viennent de
 * `MailMarketingModule` (global) ; l'empreinte d'une adresse cherchée, de
 * `MailSendsModule`. Les consultations ont leurs tables, et le plafond
 * horaire du suivi, partagé.
 */
@Module({
  imports: [MailSendsModule],
  controllers: [AdminMarketingPreferencesController],
  providers: [
    { provide: MarketingPreferenceAdminReader, useClass: PrismaMarketingPreferenceAdminReader },
    {
      provide: PreferenceConsultationsRepository,
      useClass: PrismaPreferenceConsultationsRepository,
    },
    { provide: PreferenceConsultationLedger, useClass: PrismaPreferenceConsultationLedger },
    ListMarketingPreferencesHandler,
    SearchMarketingPreferencesHandler,
    GetMarketingPreferenceSearchHandler,
    GetMarketingPreferenceHandler,
    GetMarketingPreferenceRecipientHandler,
    RevealMarketingPreferenceRecipientHandler,
    UnsubscribeMarketingPreferenceHandler,
    UnsubscribeAddressByStaffHandler,
  ],
})
export class MailMarketingAdminModule {}
