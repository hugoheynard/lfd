import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
// Un TYPE seulement : la boutique ne prend aucune valeur du baril au démarrage
// (budget `cloudflare`).
import type { OrderSaleUnit, ShelfStockTodayView } from '@lfd/contracts';
import { WORKSPACE_HEADER } from '@lfd/contracts/workspace';
import { firstValueFrom } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { AheadReads } from '../ahead-reads';
import { ClientAudience } from '../client-audience.service';
import { ClientContext } from '../client-context.service';
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
 * `documentation/limites-de-commande/jour-meme-sur-stock.md`, L7b).
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
  private readonly context = inject(ClientContext);
  private readonly order = inject(OrderContextStore);
  private readonly audience = inject(ClientAudience);
  private readonly clock = inject(ShopClock);

  /** La cible d'aujourd'hui, ou `null` hors aujourd'hui / sans point. */
  private readonly target = computed<ShelfTarget | null>(
    () => this.targetFor(this.list.readerKey()),
    { equal: sameTarget },
  );

  /**
   * La même cible, pour l'espace demandé pendant une bascule (lot c) : lue
   * d'avance, jamais servie avant l'acceptation. L'audience est celle du
   * moment ; si l'espace accepté en change, la clé diffère et la lecture
   * d'avance est simplement perdue.
   */
  private readonly aheadTarget = computed<ShelfTarget | null>(
    // Pas pendant l'essai du démarrage (lot e) : l'audience, part de la clé,
    // n'y est pas encore connue.
    () => this.targetFor(this.context.switching() ? this.context.ahead() : null),
    { equal: sameTarget },
  );

  private readonly aheadReads = new AheadReads<ShelfStockTodayView>();

  private targetFor(reader: string | null): ShelfTarget | null {
    const service = this.order.choice() ?? this.order.draft();
    if (service?.mode !== 'pickup') {
      return null;
    }
    const pickupAddressId = service.pickupAddressId ?? null;
    if (pickupAddressId === null || service.date !== parisDayOf(this.clock.now())) {
      return null;
    }
    if (reader === null) {
      return null;
    }
    return {
      pickupAddressId,
      reader,
      audience: this.audience.shown() === 'b2b' ? 'pro' : 'public',
    };
  }

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
    effect(() => {
      const ahead = this.aheadTarget();
      if (ahead !== null) {
        untracked(() => {
          this.aheadReads.ask(ahead.reader, keyOf(ahead), () => this.request(ahead));
        });
      }
    });
    this.context.whenAbandoned((workspace) => {
      this.aheadReads.forget(workspace);
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
      const view = await (this.aheadReads.take(key) ?? this.request(target));
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

  private request(target: ShelfTarget): Promise<ShelfStockTodayView> {
    const base = AUTH_CONFIG.apiBaseUrl;
    const point = encodeURIComponent(target.pickupAddressId);
    if (target.reader === VISITOR) {
      return firstValueFrom(
        this.http.get<ShelfStockTodayView>(
          `${base}/shelf-stock/today?pickupAddressId=${point}&audience=${target.audience}`,
        ),
      );
    }
    // L'espace du LECTEUR, pas celui de l'intercepteur : pendant une bascule,
    // celui-ci dit déjà l'espace pas encore accepté (lot c, 2026-11-05).
    return firstValueFrom(
      this.auth
        .accessToken$()
        .pipe(
          switchMap((token) =>
            this.http.get<ShelfStockTodayView>(
              `${base}/shelf-stock/today/mine?pickupAddressId=${point}`,
              { headers: { Authorization: `Bearer ${token}`, [WORKSPACE_HEADER]: target.reader } },
            ),
          ),
        ),
    );
  }
}

function sameTarget(a: ShelfTarget | null, b: ShelfTarget | null): boolean {
  return a === null ? b === null : b !== null && keyOf(a) === keyOf(b);
}
