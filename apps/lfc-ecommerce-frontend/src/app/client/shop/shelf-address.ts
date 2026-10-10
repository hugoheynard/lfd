import { computed, effect, inject, Injectable, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

import { operationShelfId } from './operations';
import { ShopCatalogue } from './shop-catalogue.store';
import { ShopStore } from './shop.store';
import { Shop } from './shop.service';
import { ALL_SHELVES, SHELF_PARAM } from './shelves';

/** Sentinelle « aucun paramètre encore lu » — distincte de `null` (paramètre absent). */
const UNREAD = Symbol('unread');

/**
 * **Le rayon dans l'adresse** — un lien partagé, un rechargement ou la carte
 * d'opération de l'accueil retombent sur le rayon qu'ils nomment.
 *
 * Deux sens, une seule mémoire pour ne pas boucler : le dernier paramètre lu.
 * Quand il change, c'est l'adresse qui parle et le rayon la suit ; sinon, c'est
 * le rayon qui a bougé et l'adresse est réécrite (`replaceUrl` : changer de
 * rayon n'est pas une page de plus dans l'historique).
 *
 * Un rayon inconnu du catalogue chargé (opération finie, rayon masqué) laisse
 * le rayon par défaut, sans erreur. Rien ne lit `window` : la route se lit au
 * rendu serveur comme au navigateur.
 *
 * Fourni par la page, comme {@link ShopStore} : il naît et meurt avec elle.
 */
@Injectable()
export class ShelfAddress {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly catalogue = inject(ShopCatalogue);
  private readonly store = inject(ShopStore);
  private readonly shop = inject(Shop);

  private readonly param = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get(SHELF_PARAM))),
    { initialValue: this.route.snapshot.queryParamMap.get(SHELF_PARAM) },
  );

  /** Les rayons que le catalogue chargé connaît, « Tout » compris. */
  private readonly known = computed(
    () =>
      new Set<string>([
        ALL_SHELVES,
        ...this.catalogue.operations().map((operation) => operationShelfId(operation.key)),
        ...this.catalogue.shelves().map((shelf) => shelf.id),
      ]),
  );

  private lastParam: string | null | typeof UNREAD = UNREAD;

  constructor() {
    effect(() => {
      const param = this.param();
      const shelf = this.store.shelf();
      // Avant le catalogue, on ne sait pas si le rayon existe : on attend.
      if (this.catalogue.status() !== 'ready') {
        return;
      }
      untracked(() => {
        if (param !== this.lastParam) {
          this.lastParam = param;
          if (param !== null && param !== shelf && this.known().has(param)) {
            this.shop.browse(param);
          }
          return;
        }
        this.write(shelf);
      });
    });
  }

  private write(shelf: string): void {
    const wanted = shelf === ALL_SHELVES ? null : shelf;
    if (wanted === this.param()) {
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [SHELF_PARAM]: wanted },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
