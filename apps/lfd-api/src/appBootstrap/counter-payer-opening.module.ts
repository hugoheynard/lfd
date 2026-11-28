import { Global, Module } from "@nestjs/common";

import { CounterPayerOpening } from "../lafoliecoffee/account/domain/ports/counter-payer-opening.js";
import { AccountingModule } from "../lafoliecoffee/accounting/accounting.module.js";
import { CounterPayerOpener } from "../lafoliecoffee/accounting/application/counter-payer-opener.js";

/**
 * **Un compte ouvert au comptoir naît au virement** chez chaque entité
 * émettrice en service. `account` déclare le port, la comptabilité
 * l'implémente avec ses moyens d'encaissement ; la liaison vit ici pour
 * qu'`account` n'importe rien de la comptabilité.
 */
@Global()
@Module({
  imports: [AccountingModule],
  providers: [{ provide: CounterPayerOpening, useExisting: CounterPayerOpener }],
  exports: [CounterPayerOpening],
})
export class CounterPayerOpeningModule {}
