import { ShopCopyManifest, type ShopCopyManifestEntry } from "../domain/shop-copy-manifest.js";
import manifestJson from "./embedded/shop-copy-manifest.json" with { type: "json" };
import renamesJson from "./embedded/shop-copy-renames.json" with { type: "json" };

/**
 * **Le manifeste et les renommages que cette API a compilés** (plan §10, B1).
 *
 * Les deux fichiers de `embedded/` sont des COPIES de ceux de la boutique,
 * déposées par `pnpm copy:digest` : l'émission de l'API part de `src/` et le
 * déploiement n'empaquette qu'elle. `lint:shop-copy-digest` refuse une copie
 * qui diffère de sa source — API et boutique valident donc contre les mêmes
 * clés quand elles sortent du même commit.
 */
export function embeddedShopCopyManifest(): ShopCopyManifest {
  const entries: ShopCopyManifestEntry[] = manifestJson.spaces.flatMap((space) =>
    space.entries.map((entry) => ({
      key: entry.key,
      space: space.space,
      originals: { fr: entry.fr, en: entry.en, it: entry.it },
      variables: [...new Set(entry.variables)].sort(),
    })),
  );
  return ShopCopyManifest.of(entries);
}

/** Les renommages `ancienne clé → nouvelle`, dans l'ordre du fichier. */
export function embeddedShopCopyRenames(): readonly (readonly [string, string])[] {
  const renames: Readonly<Record<string, string>> = renamesJson.renames;
  return Object.entries(renames);
}
