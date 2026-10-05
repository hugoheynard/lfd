import { Global, Module } from "@nestjs/common";

import { SiteMandateRevocation } from "../b2b/account/domain/ports/site-mandate-revocation.js";
import { SiteMandateRevoker } from "../b2b/payments/application/site-mandate-revoker.js";
import { PaymentsModule } from "../b2b/payments/payments.module.js";

/**
 * **Détacher un site révoque ses mandats qui nomment le principal**
 * (`plan-sous-comptes.md` §2.1 ter, S4). `account` déclare le port, `payments`
 * l'implémente avec ses mandats ; la liaison vit ici pour qu'`account`
 * n'importe rien de `payments`.
 */
@Global()
@Module({
  imports: [PaymentsModule],
  providers: [{ provide: SiteMandateRevocation, useExisting: SiteMandateRevoker }],
  exports: [SiteMandateRevocation],
})
export class SiteMandateRevocationModule {}
