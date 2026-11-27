import { Global, Module } from "@nestjs/common";

import { PrismaOptionGroupHoldersReader } from "../pim/catalogue/product/infrastructure/prisma-option-group-holders.reader.js";
import { PimDatabaseModule } from "../pim/infra/database/pim-database.module.js";
import { OptionGroupHoldersReader } from "../pim/reference/product-options/domain/ports/option-group-holders.reader.js";

/**
 * **Ce que le référentiel des options demande à la fiche**, relié :
 * `OptionGroupHoldersReader` — les fiches où un groupe est actif, pour les
 * réémettre quand le groupe change et compter ce qui l'active. Les options
 * déclarent, la fiche (qui écrit l'activation) implémente.
 *
 * Lié ici et non par un import de module : le catalogue importe déjà les
 * options, et l'inverse ferait un cycle.
 */
@Global()
@Module({
  imports: [PimDatabaseModule],
  providers: [{ provide: OptionGroupHoldersReader, useClass: PrismaOptionGroupHoldersReader }],
  exports: [OptionGroupHoldersReader],
})
export class OptionGroupHoldersFeedModule {}
