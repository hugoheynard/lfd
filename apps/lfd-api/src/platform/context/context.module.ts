import { Global, Module } from "@nestjs/common";

import { IdGenerator } from "../id/id-generator.js";
import { UlidGenerator } from "../id/ulid-generator.js";
import { RandomSecretGenerator } from "../secret/random-secret-generator.js";
import { SecretGenerator } from "../secret/secret-generator.js";
import { AppConfig } from "../config/app-config.js";
import { CustomerDocumentStore } from "../storage/customer-document-store.js";
import { DocumentStore } from "../storage/document-store.js";
import { MediaStore } from "../storage/media-store.js";
import { R2MediaStore } from "../storage/r2-media-store.js";
import { S3DocumentStore } from "../storage/s3-document-store.js";
import { Clock } from "../time/clock.js";
import { SystemClock } from "../time/system-clock.js";

/**
 * Fondations **cross-cutting** : les ports `Clock`, `IdGenerator`,
 * `SecretGenerator`, `DocumentStore` et `MediaStore`, câblés sur leurs adaptateurs
 * de production. `@Global` →
 * injectables partout sans ré-importer le module dans chaque contexte métier.
 *
 * `IdGenerator` et `SecretGenerator` ne font pas double emploi : le premier
 * promet l'**ordre** (ULID monotone), le second l'**entropie**. Cf.
 * `secret-generator.ts` — les confondre coûte l'une des deux propriétés.
 *
 * Le `RequestContext` (ALS) est posé par `requestContextMiddleware`, branché en
 * `app.use(...)` dans `main.ts` (pas ici) : il n'a besoin d'aucune injection.
 */
@Global()
@Module({
  providers: [
    { provide: Clock, useClass: SystemClock },
    { provide: IdGenerator, useClass: UlidGenerator },
    { provide: SecretGenerator, useClass: RandomSecretGenerator },
    // Le MÊME adaptateur, deux buckets. L'usage se décide ici, à la racine de
    // composition, et pas dans l'adaptateur : c'est un fait de déploiement, et
    // un appelant ne choisit jamais le bucket dans lequel il écrit.
    {
      provide: DocumentStore,
      inject: [AppConfig],
      useFactory: (config: AppConfig): DocumentStore => new S3DocumentStore(config, "kbis"),
    },
    {
      provide: CustomerDocumentStore,
      inject: [AppConfig],
      useFactory: (config: AppConfig): CustomerDocumentStore =>
        new S3DocumentStore(config, "customers"),
    },
    { provide: MediaStore, useClass: R2MediaStore },
  ],
  exports: [Clock, IdGenerator, SecretGenerator, DocumentStore, CustomerDocumentStore, MediaStore],
})
export class ContextModule {}
