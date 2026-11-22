import { Global, Module } from "@nestjs/common";

import { CompanyHasOrdersReader } from "../lafoliecoffee/orders/domain/ports/company-has-orders.reader.js";
import { PrismaCompanyHasOrdersReader } from "../lafoliecoffee/orders/infrastructure/prisma-company-has-orders.reader.js";

/**
 * **« Ce compte a-t-il des commandes ? », relié à la suppression d'un compte.**
 *
 * Les commandes DÉCLARENT et IMPLÉMENTENT la lecture, le compte la compose.
 * `@Global` parce que `OrdersModule` importe déjà `AccountModule` : le compte
 * ne peut pas l'importer en retour sans cycle (même figure que
 * `ParticularNoShowCountsModule`).
 */
@Global()
@Module({
  providers: [{ provide: CompanyHasOrdersReader, useClass: PrismaCompanyHasOrdersReader }],
  exports: [CompanyHasOrdersReader],
})
export class CompanyHasOrdersModule {}
