import { Global, Module } from "@nestjs/common";

import { OrdersModule } from "../b2b/orders/orders.module.js";
import { PrismaDayOrdersReader } from "../b2b/orders/infrastructure/prisma-day-orders.reader.js";
import { PrismaHandoverSubjectReader } from "../b2b/orders/infrastructure/prisma-handover-subject.reader.js";
import { PrismaPendingOrdersReader } from "../b2b/orders/infrastructure/prisma-pending-orders.reader.js";
import {
  DayOrdersReader,
  HandoverSubjectReader,
  PendingCommerceOrdersReader,
} from "../production/channels/commerce/index.js";

/**
 * **Le fil du fournil, relié.** Un module dont c'est le seul objet : brancher le
 * port publié par la production sur l'adaptateur fourni par le commerce.
 *
 * Même motif et même raison que `CatalogFeedModule` : la racine de composition
 * est le seul endroit autorisé à connaître les deux côtés à la fois. La matrice
 * interdit à `production` de voir `b2b` — le fournil DÉCLARE ce dont il a
 * besoin, il ne va pas le chercher.
 *
 * ⚠️ Le sens est l'inverse du fil catalogue, et c'est ce qui compte : là-bas le
 * référentiel publie pour la plateforme, ici c'est la production qui publie et
 * le commerce qui se plie. Un contexte qui publie un port ne doit pas connaître
 * ceux qui le branchent, sinon la dépendance revient par l'autre bout.
 *
 * `@Global` pour la raison exacte du fil catalogue : le consommateur du port est
 * `production/`, qui ne peut pas importer le module qui le fournit sans devenir
 * dépendant du commerce. Le token reste celui de la production elle-même, donc
 * rien de neuf n'est rendu atteignable.
 */
@Global()
@Module({
  imports: [OrdersModule],
  providers: [
    { provide: DayOrdersReader, useClass: PrismaDayOrdersReader },
    // Le contrepoids du couplage minimal, relié au même endroit : la production
    // demande « qu'est-ce que le commerce n'a pas basculé ? », le commerce seul
    // sait y répondre.
    { provide: PendingCommerceOrdersReader, useClass: PrismaPendingOrdersReader },
    // La remise est constatée au fournil, mais la commande derrière le jeton est
    // un fait du commerce : troisième port, même sens que les deux autres.
    { provide: HandoverSubjectReader, useClass: PrismaHandoverSubjectReader },
  ],
  exports: [DayOrdersReader, PendingCommerceOrdersReader, HandoverSubjectReader],
})
export class ProductionFeedModule {}
