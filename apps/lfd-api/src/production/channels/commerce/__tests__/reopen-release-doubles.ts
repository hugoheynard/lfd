import type { ServiceDay } from "../index.js";
import { ReopenReleasePending } from "../reopen-release.pending.js";

/**
 * Le commerce doublé pour « la remise de la réouverture est-elle faite ? » :
 * il répond `pending` (faux par défaut) et note chaque question posée.
 */
export class FixedReopenRelease extends ReopenReleasePending {
  readonly asked: { readonly day: string; readonly undoneClosedAt: Date }[] = [];

  constructor(public pending = false) {
    super();
  }

  pendingFor(day: ServiceDay, undoneClosedAt: Date): Promise<boolean> {
    this.asked.push({ day: day.value, undoneClosedAt });
    return Promise.resolve(this.pending);
  }
}
