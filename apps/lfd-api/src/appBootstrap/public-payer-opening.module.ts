import { Global, Module } from "@nestjs/common";

import { PublicPayerOpening } from "../lafoliecoffee/account/domain/ports/public-payer-opening.js";
import { AccountingModule } from "../lafoliecoffee/accounting/accounting.module.js";
import { PublicPayerOpener } from "../lafoliecoffee/accounting/application/public-payer-opener.js";

/**
 * **Activer un organisme public pose le virement** chez chaque entité
 * émettrice en service. `account` déclare le port, la comptabilité
 * l'implémente avec ses moyens d'encaissement ; la liaison vit ici pour
 * qu'`account` n'importe rien de la comptabilité.
 */
@Global()
@Module({
  imports: [AccountingModule],
  providers: [{ provide: PublicPayerOpening, useExisting: PublicPayerOpener }],
  exports: [PublicPayerOpening],
})
export class PublicPayerOpeningModule {}
