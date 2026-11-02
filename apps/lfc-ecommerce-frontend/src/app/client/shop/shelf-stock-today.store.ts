import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
// Un TYPE seulement : la boutique ne prend aucune valeur du baril au démarrage
// (budget `cloudflare`).
import type { OrderSaleUnit, ShelfStockTodayView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { ClientAudience } from '../client-audience.service';
import { OrderContextStore } from '../order-context.store';
import { SHOP_TIME_ZONE } from '../shop-time-zone';
import { VISITOR, PickupListGateway } from './pickup-list.gateway';
import { ShopClock } from './shop-clock';

/** `AAAA-MM-JJ` à Paris — `en-CA` écrit le jour dans cet ordre. */
const PARIS_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: SHOP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Le jour de Paris de cet instant, `AAAA-MM-JJ`. */
export function parisDayOf(instant: Date): string {
  return PARIS_DAY.format(instant);
}

/** Ce qui reste d'un article en vitrine aujourd'hui, dans son unité de vente. */
export interface ShelfLeft {
  readonly saleUnit: OrderSaleUnit;
  /** Des pièces, ou des GRAMMES au poids — toujours positif. */
  readonly left: number;
}

/**
 * L'état d'un article pour aujourd'hui : `null` = aucune contrainte (le jour
 * choisi n'est pas aujourd'hui, ou le reste n'est pas encore connu) ;
 * `'absent'` = plus rien en vitrine pour qui regarde ; sinon son reste.
 */
export type ShelfState = ShelfLeft | 'absent' | null;

/** Ce que la vitrine lit : le point, et qui le lit. */
interface ShelfTarget {
  readonly pickupAddressId: string;
  readonly reader: string;
  readonly audience: 'pro' | 'public';
}

/** La clé d'une lecture : deux cibles de même clé rendent la même réponse. */
function keyOf(target: ShelfTarget): string {
  return `${target.reader}|${target.audience}|${target.pickupAddressId}`;
}

/** L'état d'un article dans une réponse connue. */
export function shelfStateIn(
  lines: ReadonlyMap<string, ShelfLeft> | null,
  sku: string,
): ShelfState {
  if (lines === null) {
    return null;
  }
  return lines.get(sku) ?? 'absent';
}

/**
 * Une quantité dépasse-t-elle ce qui reste ? Un article absent n'admet rien ;
 * un article sans contrainte admet tout — le serveur reste juge.
 */
export function exceedsShelf(state: ShelfState, quantity: number): boolean {
  if (state === null || quantity <= 0) {
    return false;
  }
  return state === 'absent' || quantity > state.left;
}

/**
 * **Le reste d'aujourd'hui en vitrine, au point choisi** (plan
 * `documentation/limites-de-commande/plan-jour-meme-sur-stock.md`, L7b).
 *
 * Lu seulement quand le jour choisi est AUJOURD'HUI et que le retrait vise un
 * point : hors de là, aucune requête, et rien ne change à l'écran. Un client
 * reconnu lit `GET /shelf-stock/today/mine` (le serveur décide sa clientèle,
 * l'espace part dans l'en-tête de `workspaceInterceptor`) ; un visiteur lit
 * `GET /shelf-stock/today` avec la clientèle annoncée, comme
 * `/fulfillment-days`.
 *
 * Une ANNONCE, jamais une autorisation : la passation relit le reste sous le
 * verrou et reste seule à refuser. Un échec de lecture laisse donc l'écran
 * sans contrainte — la commande dira le refus.
 */
@Injectable({ providedIn: 'root' })
export class ShelfStockToday {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly list = inject(PickupListGateway);
  private readonly order = inject(OrderContextStore);
  private readonly audience = inject(ClientAudience);
  private readonly clock = inject(ShopClock);

  /** La cible d'aujourd'hui, ou `null` hors aujourd'hui / sans point. */
  private readonly target = computed<ShelfTarget | null>(
    () => {
      const service = this.order.choice() ?? this.order.draft();
      if (service?.mode !== 'pickup') {
        return null;
      }
      const pickupAddressId = service.pickupAddressId ?? null;
      if (pickupAddressId === null || service.date !== parisDayOf(this.clock.now())) {
        return null;
      }
      const reader = this.list.readerKey();
      if (reader === null) {
        return null;
      }
      return {
        pickupAddressId,
        reader,
        audience: this.audience.shown() === 'b2b' ? 'pro' : 'public',
      };
    },
    { equal: (a, b) => (a === null ? b === null : b !== null && keyOf(a) === keyOf(b)) },
  );

  /** La réponse, avec la clé pour laquelle elle a été servie. */
  private readonly served = signal<{
    readonly key: string;
    readonly lines: ReadonlyMap<string, ShelfLeft>;
  } | null>(null);

  /** La lecture en cours ou la dernière demandée. */
  private askedFor: string | null = null;

  /** Le reste par article, ou `null` quand rien ne contraint aujourd'hui. */
  readonly lines = computed<ReadonlyMap<string, ShelfLeft> | null>(() => {
    const target = this.target();
    const served = this.served();
    return target !== null && served !== null && served.key === keyOf(target) ? served.lines : null;
  });

  constructor() {
    effect(() => {
      const target = this.target();
      untracked(() => {
        if (target === null) {
          this.askedFor = null;
          return;
        }
        void this.read(target);
      });
    });
  }

  /** L'état de cet article pour aujourd'hui. */
  stateOf(sku: string): ShelfState {
    return shelfStateIn(this.lines(), sku);
  }

  /**
   * Relit le reste : un refus `orders.shelf.*` dit que la vitrine a bougé
   * depuis la dernière lecture. Rien hors aujourd'hui.
   */
  refresh(): void {
    const target = untracked(() => this.target());
    if (target !== null) {
      void this.read(target);
    }
  }

  private async read(target: ShelfTarget): Promise<void> {
    const key = keyOf(target);
    this.askedFor = key;
    try {
      const view = await this.fetch(target);
      if (this.askedFor === key) {
        this.served.set({
          key,
          lines: new Map(
            view.map((line) => [line.sku, { saleUnit: line.saleUnit, left: line.left }]),
          ),
        });
      }
    } catch {
      // Sans réponse, rien ne contraint : la passation reste juge.
      if (this.askedFor === key) {
        this.served.set(null);
      }
    }
  }

  private fetch(target: ShelfTarget): Promise<ShelfStockTodayView> {
    const base = AUTH_CONFIG.apiBaseUrl;
    const point = encodeURIComponent(target.pickupAddressId);
    if (target.reader === VISITOR) {
      return firstValueFrom(
        this.http.get<ShelfStockTodayView>(
          `${base}/shelf-stock/today?pickupAddressId=${point}&audience=${target.audience}`,
        ),
      );
    }
    return firstValueFrom(
      this.auth
        .accessToken$()
        .pipe(
          switchMap((token) =>
            this.http.get<ShelfStockTodayView>(
              `${base}/shelf-stock/today/mine?pickupAddressId=${point}`,
              { headers: { Authorization: `Bearer ${token}` } },
            ),
          ),
        ),
    );
  }
}
