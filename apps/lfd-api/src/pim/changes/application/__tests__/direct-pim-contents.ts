import type { ContentGuard } from "../../../../platform/day-versions/versioned-contents.js";
import { PimContents } from "../pim-contents.js";

/**
 * Le double de {@link PimContents} pour les tests d'application : lit la base
 * à chaque appel, et note les clés demandées.
 */
export class DirectPimContents extends PimContents {
  readonly keys: (string | null)[] = [];

  contentOf<T>(key: string | null, load: () => Promise<T>, _accepts: ContentGuard<T>): Promise<T> {
    this.keys.push(key);
    return load();
  }
}
