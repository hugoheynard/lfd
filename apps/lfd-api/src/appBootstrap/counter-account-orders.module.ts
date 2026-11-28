import { Global, Module } from "@nestjs/common";

import { CounterAccountOrderCountReader } from "../lafoliecoffee/orders/domain/ports/counter-account-order-count.reader.js";
import { CounterAccountOutstandingReader } from "../lafoliecoffee/orders/domain/ports/counter-account-outstanding.reader.js";
import { PrismaCounterAccountOrderCountReader } from "../lafoliecoffee/orders/infrastructure/prisma-counter-account-order-count.reader.js";
import { PrismaCounterAccountOutstandingReader } from "../lafoliecoffee/orders/infrastructure/prisma-counter-account-outstanding.reader.js";

/**
 * **Ce que doivent les comptes du comptoir, relié à leur page**
 * (`plan-comptes-du-comptoir.md`, § 4). Les commandes DÉCLARENT et
 * IMPLÉMENTENT les deux lectures par lot ; le compte les compose. `@Global`
 * parce que `OrdersModule` importe déjà `AccountModule` (même figure que
 * `CompanyHasOrdersModule`).
 */
@Global()
@Module({
  providers: [
    { provide: CounterAccountOutstandingReader, useClass: PrismaCounterAccountOutstandingReader },
    { provide: CounterAccountOrderCountReader, useClass: PrismaCounterAccountOrderCountReader },
  ],
  exports: [CounterAccountOutstandingReader, CounterAccountOrderCountReader],
})
export class CounterAccountOrdersModule {}
