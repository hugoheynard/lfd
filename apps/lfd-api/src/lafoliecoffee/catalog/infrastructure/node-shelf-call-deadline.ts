import { Injectable } from "@nestjs/common";

import { withinTimer } from "../../../platform/cache-calls/call-deadline.js";
import { ShelfCallDeadline, type Deadlined } from "../domain/ports/shelf-call-deadline.js";

/**
 * Le délai, sur un minuteur Node ({@link withinTimer}, partagé avec les autres
 * caches). L'appel abandonné continue sa course (son socket a son propre
 * filet) ; son résultat est ignoré.
 */
@Injectable()
export class NodeShelfCallDeadline extends ShelfCallDeadline {
  within<T>(work: Promise<T>, limitMs: number): Promise<Deadlined<T>> {
    return withinTimer(work, limitMs);
  }
}
