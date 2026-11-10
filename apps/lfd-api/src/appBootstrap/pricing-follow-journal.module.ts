import { Global, Module } from "@nestjs/common";

import { PricingFollowJournal } from "../lafoliecoffee/account/domain/ports/pricing-follow.journal.js";
import { PricingFollowJournalWriter } from "../lafoliecoffee/pricing/infrastructure/pricing-follow.journal-writer.js";
import { PricingAdminModule } from "../lafoliecoffee/pricing/pricing-admin.module.js";

/**
 * **Le suivi d'une mercuriale, inscrit au journal des prix** (`sous-comptes.md`,
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
