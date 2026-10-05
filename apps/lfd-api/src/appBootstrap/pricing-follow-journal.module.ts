import { Global, Module } from "@nestjs/common";

import { PricingFollowJournal } from "../b2b/account/domain/ports/pricing-follow.journal.js";
import { PricingFollowJournalWriter } from "../b2b/pricing/infrastructure/pricing-follow.journal-writer.js";
import { PricingAdminModule } from "../b2b/pricing/pricing-admin.module.js";

/**
 * **Le suivi d'une mercuriale, inscrit au journal des prix** (`plan-sous-comptes.md`,
 * S3). `account` déclare le port, la tarification l'implémente avec son
 * écrivain d'actes ; la liaison vit ici pour qu'`account` n'importe rien de
 * `pricing`.
 */
@Global()
@Module({
  imports: [PricingAdminModule],
  providers: [{ provide: PricingFollowJournal, useClass: PricingFollowJournalWriter }],
  exports: [PricingFollowJournal],
})
export class PricingFollowJournalModule {}
