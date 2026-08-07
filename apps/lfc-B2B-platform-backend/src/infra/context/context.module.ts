import { Global, Module } from "@nestjs/common";

import { IdGenerator } from "../id/id-generator.js";
import { UlidGenerator } from "../id/ulid-generator.js";
import { Clock } from "../time/clock.js";
import { SystemClock } from "../time/system-clock.js";

/**
 * Fondations **cross-cutting** : le port `Clock` et le port `IdGenerator`,
 * câblés sur leurs adaptateurs de production. `@Global` → injectables partout
 * sans ré-importer le module dans chaque contexte métier.
 *
 * Le `RequestContext` (ALS) est posé par `requestContextMiddleware`, branché en
 * `app.use(...)` dans `main.ts` (pas ici) : il n'a besoin d'aucune injection.
 */
@Global()
@Module({
  providers: [
    { provide: Clock, useClass: SystemClock },
    { provide: IdGenerator, useClass: UlidGenerator },
  ],
  exports: [Clock, IdGenerator],
})
export class ContextModule {}
