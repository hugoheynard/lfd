import type { ShopCatalogueView } from "@lfd/contracts";

/**
 * La clé d'un rayon pro : la société résolue EN BASE par `@ActingCompany`,
 * jamais une valeur du client. `null` = l'espace perso (ou aucune société
 * résolue), qui a sa propre entrée (`le-rayon-en-cache.md`, § 4).
 */
export type ShelfKey = string | null;

/**
 * Ce qu'une lecture rend : le rayon rangé, ou un raté portant la **version**
 * courante du magasin — celle que le calcul qui suit présentera pour ranger.
 */
export type ShelfLookup =
  | { readonly kind: "hit"; readonly view: ShopCatalogueView }
  | { readonly kind: "miss"; readonly version: number };

/** Un rayon calculé, présenté au rangement. */
export interface ShelfToStore {
  readonly key: ShelfKey;
  readonly view: ShopCatalogueView;
  /** La version relevée AVANT le calcul. */
  readonly version: number;
  /**
   * Le principal de la société, quel que soit son statut : une purge de ce
   * principal efface aussi cette entrée (« une société et ses sites »).
   */
  readonly principalId: string | null;
  /**
   * L'échéance, posée par l'API sur son `Clock` : 5 minutes au plus, ou plus
   * tôt le prochain instant d'une opération datée
   * (`le-rayon-en-cache.md`, § 6).
   */
  readonly expiresAt: Date;
}

/**
 * `stored` : rangé. `stale` : refusé, la version a avancé pendant le calcul
 * (une purge est passée, le rayon peut être l'ancien). `not_kept` : le magasin
 * ne garde rien (« sans cache », dev local et e2e).
 */
export type StoreOutcome = "stored" | "stale" | "not_kept";

/**
 * **Le magasin des rayons pro**, vu par le service du rayon (`le-rayon-en-cache.md`,
 * § 4 ter). Aujourd'hui un Durable Object joint par un gestionnaire de
 * sortie ; demain peut-être un Redis — un adaptateur de plus, ce port et ses
 * appelants inchangés.
 *
 * Lecture et rangement seulement (ISP) : l'effacement est {@link ShopShelfEraser},
 * appelé par la purge et par personne d'autre.
 *
 * Un adaptateur peut lever ou tarder : le service ne l'appelle qu'à travers
 * `ResilientShopShelfCache`, qui retombe sur la base (§ 4 bis).
 */
export abstract class ShopShelfCache {
  /**
   * @param now l'instant de la requête (`Clock`) : une entrée échue à cet
   *   instant est un raté. Le magasin ne lit jamais l'heure lui-même.
   */
  abstract read(key: ShelfKey, now: Date): Promise<ShelfLookup>;

  /** Range le rayon si la version du magasin vaut encore `entry.version`. */
  abstract store(entry: ShelfToStore): Promise<StoreOutcome>;
}
