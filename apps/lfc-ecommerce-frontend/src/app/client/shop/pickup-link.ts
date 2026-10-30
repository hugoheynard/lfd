import { effect, inject, Injectable, isDevMode, PLATFORM_ID, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

import { OrderDoors } from './order-doors';
import { ServicePoints } from './pickup-points.store';

/**
 * Le paramètre d'adresse qui désigne un point de retrait :
 * `/boutique?retrait=<id du point>`. Un paramètre de REQUÊTE, pas un fragment :
 * un `#` n'arrive pas au rendu serveur, et les intermédiaires (Google, les
 * raccourcisseurs) le perdent plus volontiers.
 */
export const PICKUP_PARAM = 'retrait';

/**
 * **Le lien direct d'un point de retrait** — le bouton « Commander » d'une
 * fiche Google My Business, une adresse par site.
 *
 * Même figure que `ShelfAddress` : le paramètre se lit sur la route, au rendu
 * serveur comme au navigateur, et rien ne lit `window`. Mais il ne se LIT
 * qu'une fois et ne se réécrit jamais : à l'arrivée, le point désigné devient
 * le retrait retenu ({@link OrderDoors.designate}), puis le paramètre quitte
 * l'adresse (`replaceUrl`). Un rechargement ou un lien recopié plus tard ne
 * réimpose donc pas un choix que le client aurait changé entre-temps.
 *
 * On attend que la liste des points soit servie POUR qui regarde
 * (`pickupsKnown`) : c'est elle qui dit si le point est offert à cette
 * clientèle. Inconnu, archivé ou fermé à cette clientèle, il n'y figure pas —
 * la boutique s'ouvre alors normalement, et seule la console de dev le dit.
 * Une lecture des points en échec laisse le paramètre : un rechargement
 * retentera.
 *
 * Rien ne s'applique au rendu serveur : le choix vit dans le navigateur, et
 * une navigation pendant le rendu y deviendrait une redirection.
 *
 * Fourni par la page, comme `ShelfAddress` : il naît et meurt avec elle.
 */
@Injectable()
export class PickupLink {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly points = inject(ServicePoints);
  private readonly doors = inject(OrderDoors);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Le point nommé par l'adresse, ou `null`. */
  readonly param = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get(PICKUP_PARAM))),
    { initialValue: this.route.snapshot.queryParamMap.get(PICKUP_PARAM) },
  );

  constructor() {
    if (!this.browser) {
      return;
    }
    effect(() => {
      const id = this.param();
      if (id === null) {
        return;
      }
      untracked(() => {
        void this.points.hydrate();
      });
      if (!this.points.pickupsKnown()) {
        return;
      }
      const point = this.points.pickups().find((candidate) => candidate.id === id);
      untracked(() => {
        if (point === undefined) {
          if (isDevMode()) {
            console.info(`[retrait] point « ${id} » non offert ici : lien ignoré.`);
          }
        } else {
          this.doors.designate(point);
        }
        this.forget();
      });
    });
  }

  private forget(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [PICKUP_PARAM]: null },
      queryParamsHandling: 'merge',
      preserveFragment: true,
      replaceUrl: true,
    });
  }
}
