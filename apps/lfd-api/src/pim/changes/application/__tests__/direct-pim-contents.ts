import type { ContentGuard } from "../../../../platform/day-versions/versioned-contents.js";
import { PimContents, type VersionedContent } from "../pim-contents.js";

/**
 * Le double de {@link PimContents} pour les tests d'application : lit la base
 * à chaque appel, note les clés demandées, et rend le numéro qu'on lui pose.
 */
export class DirectPimContents extends PimContents {
  readonly keys: (string | null)[] = [];

  constructor(private readonly version = 0) {
    super();
  }

  contentOf<T>(key: string | null, load: () => Promise<T>, _accepts: ContentGuard<T>): Promise<T> {
    this.keys.push(key);
    return load();
  }

  async versionedContentOf<T>(
    key: string,
    load: () => Promise<T>,
    _accepts: ContentGuard<T>,
  ): Promise<VersionedContent<T>> {
    this.keys.push(key);
    return { version: this.version, content: await load() };
  }
}
