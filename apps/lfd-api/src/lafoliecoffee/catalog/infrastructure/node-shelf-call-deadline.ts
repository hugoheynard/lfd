import { Injectable } from "@nestjs/common";

import { ShelfCallDeadline, type Deadlined } from "../domain/ports/shelf-call-deadline.js";

/**
 * Le délai, sur un minuteur Node. Le minuteur est toujours désarmé : un appel
 * rapide ne laisse rien derrière lui. L'appel abandonné continue sa course
 * (son socket a son propre filet) ; son résultat est ignoré.
 */
@Injectable()
export class NodeShelfCallDeadline extends ShelfCallDeadline {
  async within<T>(work: Promise<T>, limitMs: number): Promise<Deadlined<T>> {
    let timer: NodeJS.Timeout | undefined;
    const late = new Promise<Deadlined<T>>((resolve) => {
      timer = setTimeout(() => resolve({ kind: "late" }), limitMs);
    });
    try {
      return await Promise.race([
        work.then((value): Deadlined<T> => ({ kind: "in_time", value })),
        late,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
