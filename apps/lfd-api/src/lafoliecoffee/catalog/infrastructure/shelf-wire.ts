import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";

import type { ShopCatalogueView } from "@lfd/contracts";

import type { ShelfKey } from "../domain/ports/shop-shelf-cache.js";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/**
 * Le chemin d'une entrée chez l'objet des rayons pro — le même contrat que
 * `container/shelf-store.ts` (`shelfPathKey`). Deux formes explicites plutôt
 * qu'une valeur sentinelle : l'espace perso ne peut pas se confondre avec une
 * société, quel que soit l'identifiant de celle-ci.
 */
export function shelfPath(key: ShelfKey): string {
  return key === null ? "/shelves/personal" : `/shelves/company/${encodeURIComponent(key)}`;
}

/**
 * Le rayon compressé en gzip : ~120 Ko en clair, ~11 Ko compressé (mesuré en
 * production le 2026-11-04, § 2). C'est l'API qui compresse : l'objet range
 * des octets et ne les ouvre jamais.
 */
export async function packedShelf(view: ShopCatalogueView): Promise<Uint8Array> {
  return new Uint8Array(await gzipAsync(Buffer.from(JSON.stringify(view), "utf8")));
}

/** L'inverse de {@link packedShelf} ; `null` si les octets ne sont pas un rayon. */
export async function unpackedShelf(bytes: Uint8Array): Promise<ShopCatalogueView | null> {
  try {
    const parsed: unknown = JSON.parse((await gunzipAsync(bytes)).toString("utf8"));
    return isShopCatalogueView(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Les trois listes d'un rayon. Les octets sont ceux que l'API a elle-même
 * rangés : la garde n'attrape qu'une réponse tronquée ou étrangère, pas une
 * forme que l'API aurait mal écrite.
 */
function isShopCatalogueView(value: unknown): value is ShopCatalogueView {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return ["shelves", "items", "operations"].every((field) =>
    Array.isArray(Reflect.get(value, field)),
  );
}
