import { Global, Module } from "@nestjs/common";

import { CommerceGeneralOrderCutoffReader } from "../b2b/order-cutoffs/infrastructure/pim-general-order-cutoff.reader.js";
import { OrderCutoffsInForceModule } from "../b2b/order-cutoffs/order-cutoffs-in-force.module.js";
import { GeneralOrderCutoffReader } from "../pim/channels/b2b-platform/general-order-cutoff/general-order-cutoff.reader.js";

/**
 * **La règle générale du commerce, montrée au référentiel.** Un module dont
 * c'est le seul objet : brancher le port que le référentiel déclare sur
 * l'adaptateur que le commerce fournit — le motif d'`ImageCatalogueModule`.
 *
 * `@Global` pour la même raison : le consommateur est `pim/`, qui ne peut pas
 * importer un module du commerce (`pim → b2b` est interdit).
 */
@Global()
@Module({
  imports: [OrderCutoffsInForceModule],
  providers: [{ provide: GeneralOrderCutoffReader, useExisting: CommerceGeneralOrderCutoffReader }],
  exports: [GeneralOrderCutoffReader],
})
export class GeneralOrderCutoffModule {}
