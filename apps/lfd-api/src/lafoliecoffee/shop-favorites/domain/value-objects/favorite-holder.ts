/** Les deux sortes d'espace qui gardent des favoris. */
export const FAVORITE_HOLDER_TYPES = ["company", "user"] as const;

export type FavoriteHolderType = (typeof FAVORITE_HOLDER_TYPES)[number];

/**
 * **L'espace qui garde des favoris** — une société (un site est la sienne), ou
 * l'espace personnel d'une personne (`documentation/commandes/boutique/les-favoris.md`).
 *
 * Tiré du principal, jamais d'un corps : c'est le mur des favoris.
 */
export interface FavoriteHolder {
  readonly type: FavoriteHolderType;
  readonly id: string;
}

/** L'espace courant : la société pour laquelle on agit, sinon la personne. */
export function favoriteHolderOf(userId: string, actingCompanyId: string | null): FavoriteHolder {
  return actingCompanyId === null
    ? { type: "user", id: userId }
    : { type: "company", id: actingCompanyId };
}
