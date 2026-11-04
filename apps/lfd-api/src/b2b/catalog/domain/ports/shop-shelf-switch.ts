/**
 * Un geste de l'interrupteur du cache des rayons pro (`plan-cache-du-catalogue.md`,
 * « L'interrupteur ») : éteindre, rallumer, vider. La même liste que
 * `container/shelf-store.ts` (`ShelfSwitchAction`).
 */
export type ShelfSwitchAction = "on" | "off" | "purge";

/** L'état du magasin APRÈS le geste, tel que le magasin le relit. */
export interface ShelfCacheState {
  readonly enabled: boolean;
  /** La version courante : une extinction ou une purge la fait monter. */
  readonly version: number;
}

/**
 * **L'interrupteur du magasin des rayons pro** — un port à part de la lecture
 * (`ShopShelfCache`) et de l'effacement (`ShopShelfEraser`) : seule la route
 * machine d'exploitation l'appelle (ISP).
 *
 * L'état vit DANS le magasin, pas dans l'API : un geste vaut pour toutes les
 * instances, survit à un redémarrage du conteneur, et ne demande aucun
 * redéploiement.
 *
 * Pas de repli ici, à l'inverse de la lecture : un geste d'exploitation qui
 * échoue doit le dire à qui l'a lancé.
 *
 * @throws {ShelfCacheNotConfiguredError} aucun magasin n'est configuré.
 */
export abstract class ShopShelfSwitch {
  abstract apply(action: ShelfSwitchAction): Promise<ShelfCacheState>;
}
