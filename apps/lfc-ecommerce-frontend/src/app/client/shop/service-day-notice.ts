import { computed, effect, inject, Injectable, untracked } from '@angular/core';
import { instantToLocal } from '@lfd/contracts';

import { CartStore } from '../cart/cart.store';
import { ClientLocale } from '../client-locale.service';
import { fill } from '../copy/client-copy.service';
import { commandTermsCopy } from '../copy/screens/command-terms.copy';
import { screenCopy } from '../copy/shop-copy-composer';
import { serviceDayLabel } from '../format-day';
import { OrderContextStore } from '../order-context.store';
import { leftLabel, limitHourLabel, weekdayLabel } from './cutoff-labels';
import { ServicePoints } from './pickup-points.store';
import {
  type CartItemLimit,
  dayNoLongerPossible,
  decideDayNotice,
  type DayNotice,
  limitHasPassed,
  offersDayChange,
} from './service-day-notice.rules';
import { ShopCatalogue } from './shop-catalogue.store';
import { ShopClock } from './shop-clock';

/**
 * **Ce que la barre et le panier disent du jour de service**, avant de régler.
 *
 * 🔴 Régression du 2026-10-13 (Hugo : « je croyais commander pour demain et au
 * final j'ai deux commandes pour jeudi ») : passé la limite, le serveur
 * accorde le surlendemain, et la boutique le disait en un mot discret.
 *
 * 🔴 Régression du 2026-10-21 (démo) : la correction comparait le jour GARDÉ à
 * demain, et disait « Trop tard pour demain » pour un jour choisi plus tôt ou
 * celui d'une opération — alors que le serveur accordait demain. Depuis, la
 * décision est {@link decideDayNotice} : « trop tard » seulement quand c'est
 * vrai, et AVANT, l'heure limite annoncée (`FulfillmentDayView.orderUntil`) :
 * « Plus que 2 h 15 pour commander pour jeudi ».
 *
 * La limite qui tombe page ouverte fait relire `/fulfillment-days` une fois.
 *
 * « Trop tard pour demain » a été retiré le 2026-10-27 (Hugo : « si le jour
 * choisi est ok pour l'heure limite, on ne devrait pas afficher le warning ») :
 * le jour se choisit au panneau du jour, et un jour accordé n'a rien à dire.
 *
 * Un service et non un composant : deux surfaces le disent, et deux phrases du
 * même fait finissent par diverger.
 */
@Injectable({ providedIn: 'root' })
export class ServiceDayNotice {
  private readonly order = inject(OrderContextStore);
  private readonly points = inject(ServicePoints);
  private readonly locale = inject(ClientLocale);
  private readonly clock = inject(ShopClock);
  private readonly cart = inject(CartStore);
  private readonly catalogue = inject(ShopCatalogue);
  private readonly c = screenCopy('commandTerms', commandTermsCopy);

  private refreshedFor: string | null = null;

  private readonly point = computed(() => {
    const service = this.order.choice();
    return service?.mode === 'pickup' ? service.pickupAddressId : null;
  });

  /**
   * Les articles du panier qui portent leur propre limite (2026-10-21) : le
   * serveur ne la sert que plus stricte que la générale, et c'est alors elle
   * qui peut décider du compte à rebours.
   */
  private readonly cartLimits = computed<readonly CartItemLimit[]>(() => {
    const quantities = this.cart.quantities();
    return this.catalogue
      .items()
      .flatMap((item) =>
        item.orderTimeLimit !== undefined && (quantities[item.sku] ?? 0) > 0
          ? [{ name: item.name, limit: item.orderTimeLimit }]
          : [],
      );
  });

  private readonly decision = computed<DayNotice>(() => {
    const service = this.order.choice();
    const now = this.clock.now();
    const point = this.point();
    const day = this.points.dayFor(point);
    return decideDayNotice({
      now,
      held: service?.date ?? null,
      first: day?.date ?? null,
      firstOrderUntil: day?.orderUntil ?? null,
      byOperation: this.points.daysScopedToCart(),
      cartLimits: this.cartLimits(),
    });
  });

  /** La phrase, ou `null` : rien à dire, la barre nomme déjà le jour retenu. */
  readonly message = computed<string | null>(() => this.say(this.decision()));

  /**
   * Le jour retenu n'est plus possible : le panier ne laisse pas régler
   * (2026-10-26) — la passation le refuserait en `orders.cutoff.past`.
   */
  readonly dayUnavailable = computed(() =>
    dayNoLongerPossible(this.decision(), this.order.choice()?.date ?? null),
  );

  /** L'encadré offre « Modifier » (cf. {@link offersDayChange}). */
  readonly offersChange = computed(() =>
    offersDayChange(this.decision(), this.order.choice()?.date ?? null),
  );

  constructor() {
    effect(() => {
      const point = this.point();
      const day = this.points.dayFor(point);
      const now = this.clock.now();
      untracked(() => {
        this.refreshOnceWhenPassed(day?.orderUntil ?? null, now);
      });
    });
  }

  /** Une relecture par limite tombée : un serveur qui la resservirait ne fait pas boucler. */
  private refreshOnceWhenPassed(orderUntil: string | null, now: Date): void {
    if (
      orderUntil !== null &&
      orderUntil !== this.refreshedFor &&
      limitHasPassed(orderUntil, now)
    ) {
      this.refreshedFor = orderUntil;
      this.points.refreshDaysNow();
    }
  }

  private say(notice: DayNotice): string | null {
    if (notice === null) {
      return null;
    }
    const copy = this.c();
    const locale = this.locale.current();
    const today = instantToLocal(this.clock.now()).day;
    const day = (date: string): string =>
      serviceDayLabel(date, today, locale, { today: copy.today, tomorrow: copy.tomorrow });
    switch (notice.kind) {
      case 'slipped':
        return fill(copy.slipped, { day: day(notice.held), next: day(notice.first) });
      case 'operation':
        return fill(copy.operationPickupFrom, { day: day(notice.first) });
      case 'countdown':
        return fill(notice.item === undefined ? copy.cutoffCountdown : copy.cutoffCountdownItem, {
          left: leftLabel(notice.minutesLeft, copy),
          day: weekdayLabel(notice.first, locale),
        });
      case 'itemTooLate':
        return fill(
          notice.others === 0
            ? copy.itemTooLate
            : notice.others === 1
              ? copy.itemTooLateOther
              : copy.itemTooLateOthers,
          {
            count: String(notice.others + 1),
            day: weekdayLabel(notice.day, locale),
            next: weekdayLabel(notice.next, locale),
          },
        );
      case 'calm':
        return fill(notice.item === undefined ? copy.cutoffCalm : copy.cutoffCalmItem, {
          day: weekdayLabel(notice.first, locale),
          time: limitHourLabel(notice.until, locale),
        });
    }
  }
}
