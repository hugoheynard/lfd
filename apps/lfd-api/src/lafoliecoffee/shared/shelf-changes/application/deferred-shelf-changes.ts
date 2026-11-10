import { Injectable } from "@nestjs/common";

import { AfterCommit } from "../../../../platform/database/after-commit.js";
import type { ShelfChangeScope } from "../domain/shelf-change-scope.js";
import { ShelfChanges } from "../domain/ports/shelf-changes.js";
import { ShelfChangeWindow } from "./shelf-change-window.js";

/**
 * Le signal, rangé dans la fenêtre **après la validation** seulement : une
 * transaction qui échoue n'efface rien. Hors transaction, `AfterCommit`
 * l'exécute tout de suite.
 */
@Injectable()
export class DeferredShelfChanges extends ShelfChanges {
  constructor(
    private readonly afterCommit: AfterCommit,
    private readonly window: ShelfChangeWindow,
  ) {
    super();
  }

  changed(scope: ShelfChangeScope): void {
    this.afterCommit.defer(() => {
      this.window.record(scope);
    }, "shelf.changed");
  }
}
