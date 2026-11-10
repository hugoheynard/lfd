/**
 * **Ce qu'un changement efface des rayons** (`documentation/caching-usage/le-rayon-en-cache.md`,
 * partie 1, « Ce qu'une purge efface »).
 *
 * Deux portées seulement, et c'est voulu : on ne sait pas énumérer les
 * sociétés d'un segment, donc tout ce qui n'est pas la décision d'UNE société
 * efface tout.
 *
 * Une portée `company` désigne **la société ET ses sites** : un site hérite de
 * son principal. Elle ne les résout pas ici — c'est le magasin des rayons (C2)
 * qui sait quelles clés appartiennent à une société ; la purge garde
 * l'identifiant tel quel.
 */
export type ShelfChangeScope =
  { readonly kind: "all" } | { readonly kind: "company"; readonly companyId: string };

/** Tous les rayons, public compris. */
export const ALL_SHELVES: ShelfChangeScope = { kind: "all" };

/** Les rayons d'une société et de ses sites. */
export function companyShelves(companyId: string): ShelfChangeScope {
  return { kind: "company", companyId };
}

/**
 * La portée d'une décision de prix selon son audience : une société efface ses
 * rayons (et ceux de ses sites) ; un segment ou tous effacent tout — on ne
 * sait pas énumérer les sociétés d'un segment.
 */
export function audienceShelves(audience: {
  readonly type: string;
  readonly id: string | null;
}): ShelfChangeScope {
  return audience.type === "company" && audience.id !== null
    ? companyShelves(audience.id)
    : ALL_SHELVES;
}

/**
 * La portée d'une décision à plusieurs cibles (une promotion) : chaque cible
 * est une société, ou `null` pour une cible plus large qu'une société
 * (« les pros », « tout le monde »). Une seule cible large efface tout.
 */
export function targetedShelves(targets: readonly (string | null)[]): readonly ShelfChangeScope[] {
  if (targets.length === 0 || targets.includes(null)) {
    return [ALL_SHELVES];
  }
  return [...new Set(targets)].flatMap((id) => (id === null ? [] : [companyShelves(id)]));
}
