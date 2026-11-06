import { Module } from "@nestjs/common";

import { CatalogueSnapshotStore } from "./infrastructure/catalogue-snapshot/catalogue-snapshot.store.js";

/**
 * **L'instantané du catalogue, une seule mémoire pour le processus**
 * (`documentation/caching-usage/plan-materiaux-du-catalogue.md`, lot M1b).
 *
 * Un module à lui, qui n'importe rien (base et configuration sont globales) :
 * le catalogue le lit pour ses articles, et `OrderCutoffsInForceModule` pour
 * l'heure limite générale — or ce dernier est importé PAR `CatalogModule`, et
 * l'importer en retour fermerait un cycle. Les deux importent celui-ci, et
 * partagent donc la même instance.
 */
@Module({
  providers: [CatalogueSnapshotStore],
  exports: [CatalogueSnapshotStore],
})
export class CatalogueSnapshotModule {}
