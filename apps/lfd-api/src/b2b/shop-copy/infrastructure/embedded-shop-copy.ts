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

/**
 * Les renommages `ancienne clé → nouvelle`, dans l'ordre du fichier.
 *
 * Une entrée `"ancienne.cle": null` est un texte **retiré** du code, voulu
 * (lot T4) : il n'y a rien à reporter. Elle n'est pas rendue ici ; le
 * remplacement posé sous l'ancienne clé reste orphelin — jamais servi
 * (`GetPublishedShopCopyHandler` filtre par le manifeste), montré à l'éditeur
 * (`shopCopyAdminView`).
 */
export function embeddedShopCopyRenames(): readonly (readonly [string, string])[] {
  return relocationsOf(renamesJson.renames);
}

/** Les seules entrées qui déplacent : un retrait (`null`) n'a rien à reporter. */
export function relocationsOf(
  renames: Readonly<Record<string, string | null>>,
): readonly (readonly [string, string])[] {
  return Object.entries(renames).flatMap(([from, to]) =>
    to === null ? [] : [[from, to] as const],
  );
}
