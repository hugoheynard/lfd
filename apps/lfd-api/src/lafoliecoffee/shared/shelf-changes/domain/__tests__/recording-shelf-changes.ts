import type { ShelfChangeScope } from "../shelf-change-scope.js";
import { ShelfChanges } from "../ports/shelf-changes.js";

/**
 * Un signal **enregistré** : les écrivains se testent sur la portée qu'ils
 * annoncent. Le report après validation appartient à l'adaptateur et se prouve
 * sur lui (`deferred-shelf-changes.spec.ts`).
 */
export class RecordingShelfChanges extends ShelfChanges {
  readonly scopes: ShelfChangeScope[] = [];

  changed(scope: ShelfChangeScope): void {
    this.scopes.push(scope);
  }
}
