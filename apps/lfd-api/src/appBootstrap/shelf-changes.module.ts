import { Global, Module } from "@nestjs/common";

import { DeferredShelfChanges } from "../b2b/shared/shelf-changes/application/deferred-shelf-changes.js";
import { ShelfChangeWindow } from "../b2b/shared/shelf-changes/application/shelf-change-window.js";
import { ShelfChanges } from "../b2b/shared/shelf-changes/domain/ports/shelf-changes.js";
import { ShelfPurge } from "../b2b/shared/shelf-changes/domain/ports/shelf-purge.js";
import { ShelfWindowTimer } from "../b2b/shared/shelf-changes/domain/ports/shelf-window-timer.js";
import { LoggingShelfPurge } from "../b2b/shared/shelf-changes/infrastructure/logging-shelf-purge.js";
import { NodeShelfWindowTimer } from "../b2b/shared/shelf-changes/infrastructure/node-shelf-window-timer.js";

/**
 * **Le signal des rayons** (`documentation/pricing/moteur/plan-cache-du-catalogue.md`, C1).
 *
 * `@Global` parce que les écrivains sont dispersés dans six contextes du
 * commerce (catalogue, opérations, heures limites, prix, promotions, comptes)
 * et qu'aucun ne doit dépendre d'un module qui ne le concerne pas.
 *
 * UNE fenêtre pour tout le processus : `ShelfChangeWindow` est un singleton,
 * c'est ce qui regroupe une rafale venue de plusieurs écrivains.
 *
 * C2 et C3 remplacent `ShelfPurge` ici, et seulement ici : la journalisation
 * de C1 devient la vraie purge.
 */
@Global()
@Module({
  providers: [
    ShelfChangeWindow,
    { provide: ShelfChanges, useClass: DeferredShelfChanges },
    { provide: ShelfPurge, useClass: LoggingShelfPurge },
    { provide: ShelfWindowTimer, useClass: NodeShelfWindowTimer },
  ],
  exports: [ShelfChanges],
})
export class ShelfChangesModule {}
