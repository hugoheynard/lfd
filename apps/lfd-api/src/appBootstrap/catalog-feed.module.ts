import { Global, Module } from "@nestjs/common";

import { CatalogModule } from "../b2b/catalog/catalog.module.js";
import { B2bCatalogDriver } from "../pim/channels/b2b-platform/products/driver.js";
import { InProcessB2bCatalogDriver } from "../b2b/catalog/infrastructure/in-process-catalog.driver.js";

/**
 * **Le fil catalogue, relié.** Un module dont c'est le seul objet : brancher le
 * port publié par le référentiel sur l'adaptateur fourni par la plateforme.
 *
 * Il vit dans la racine de composition parce que c'est le seul endroit du
 * backend autorisé à connaître les deux côtés à la fois — la matrice des
 * frontières interdit à `pim` de voir `b2b`, et le jour où l'assemblage
 * remonterait dans l'un des deux, la frontière serait franchie par la porte de
 * service.
 *
 * `@Global` pour une raison précise, et pas par commodité : le consommateur du
 * port est `pim/channels/b2b-platform`, qui ne peut pas importer le module qui
 * le fournit sans devenir dépendant de la plateforme. Un binding de racine se
 * déclare une fois et se voit de partout ; il ne rend rien atteignable qui ne
 * le fût déjà, puisque le token est celui du référentiel lui-même.
 */
@Global()
@Module({
  imports: [CatalogModule],
  providers: [{ provide: B2bCatalogDriver, useClass: InProcessB2bCatalogDriver }],
  exports: [B2bCatalogDriver],
})
export class CatalogFeedModule {}
