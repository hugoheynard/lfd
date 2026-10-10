import type { Prisma } from "../../platform/database/client/client.js";

import type { LibraryQuery } from "../domain/ports/media-library-reader.js";

/**
 * Traduit la recherche en `where`, et rend `{}` quand elle ne demande rien.
 *
 * Le même `where` sert la page ET le total : les séparer ferait annoncer un
 * nombre de résultats que le filtre ne rendrait pas.
 *
 * ⚠️ Une chaîne VIDE n'est pas un critère : un filtre absent doit être absent.
 *
 * ⚠️ Les tags sont normalisés à l'ÉCRITURE (découpés, minuscules,
 * dédoublonnés). On les met donc en minuscules ici aussi : `hasEvery` compare
 * des valeurs exactes, et un « Croissant » coché ne trouverait rien.
 *
 * `tags` et `untagged` ensemble ne trouvent rien, et c'est exact : une image
 * ne peut pas porter « croissant » et aucun mot.
 */
export function filterOf(query: LibraryQuery): Prisma.MediaAssetWhereInput {
  const clauses: Prisma.MediaAssetWhereInput[] = [];
  const needle = query.q?.trim() ?? "";
  if (needle !== "") {
    clauses.push({ name: { contains: needle, mode: "insensitive" } });
  }
  const tags = (query.tags ?? [])
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag !== "");
  if (tags.length > 0) {
    clauses.push({ tags: { hasEvery: tags } });
  }
  if (query.seriesId !== undefined && query.seriesId !== "") {
    clauses.push({ seriesId: query.seriesId });
  }
  if (query.untagged === true) {
    clauses.push({ tags: { isEmpty: true } });
  }
  if (query.depositedFrom !== undefined) {
    clauses.push({ createdAt: { gte: query.depositedFrom } });
  }
  if (query.depositedBefore !== undefined) {
    clauses.push({ createdAt: { lt: query.depositedBefore } });
  }
  return clauses.length === 0 ? {} : { AND: clauses };
}
