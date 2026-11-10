import type { ShopCopyLocale } from "./shop-copy-locale.js";

/** Une clé du manifeste : son espace, ses textes du code, ses variables. */
export interface ShopCopyManifestEntry {
  readonly key: string;
  readonly space: string;
  readonly originals: Readonly<Record<ShopCopyLocale, string>>;
  /** Les noms des `{variables}`, triés, sans doublon. */
  readonly variables: readonly string[];
}

/**
 * **Le manifeste des textes** que cette API a compilé (plan §10, B1).
 *
 * Il est la référence de toute validation : API et boutique sortent du même
 * commit, et une clé qu'il ne connaît pas est orpheline — lue, montrée,
 * jamais appliquée.
 */
export class ShopCopyManifest {
  private readonly byKey: ReadonlyMap<string, ShopCopyManifestEntry>;

  private constructor(private readonly ordered: readonly ShopCopyManifestEntry[]) {
    this.byKey = new Map(ordered.map((entry) => [entry.key, entry]));
  }

  static of(entries: readonly ShopCopyManifestEntry[]): ShopCopyManifest {
    return new ShopCopyManifest(entries);
  }

  entry(key: string): ShopCopyManifestEntry | null {
    return this.byKey.get(key) ?? null;
  }

  knows(key: string): boolean {
    return this.byKey.has(key);
  }

  /** Les clés dans l'ordre du manifeste (parcours de commande d'abord). */
  entries(): readonly ShopCopyManifestEntry[] {
    return this.ordered;
  }
}
