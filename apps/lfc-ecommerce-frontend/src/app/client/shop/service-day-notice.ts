import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { addDays, instantToLocal } from '@lfd/contracts';

import { ClientLocale } from '../client-locale.service';
import { fill } from '../copy/client-copy.service';
import { commandTermsCopy } from '../copy/screens/command-terms.copy';
import { screenCopy } from '../copy/shop-copy-composer';
import { serviceDayLabel } from '../format-day';
import { OrderContextStore } from '../order-context.store';
import { leftLabel, limitHourLabel, weekdayLabel } from './cutoff-labels';
import { ServicePoints } from './pickup-points.store';
import { decideDayNotice, type DayNotice, limitHasPassed } from './service-day-notice.rules';
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
 * Celle de demain est retenue tant qu'on l'a lue : c'est elle que « trop tard »
 * dit — le serveur ne sert que la limite du jour qu'il accorde.
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
  private readonly c = screenCopy('commandTerms', commandTermsCopy);

  /** Les limites lues, par `point|jour` — demain une fois tombé n'est plus servi. */
  private readonly seenLimits = signal<ReadonlyMap<string, string>>(new Map());
  private refreshedFor: string | null = null;

  private readonly point = computed(() => {
    const service = this.order.choice();
    return service?.mode === 'pickup' ? service.pickupAddressId : null;
  });

  private readonly decision = computed<DayNotice>(() => {
    const service = this.order.choice();
    if (service === null) {
      return null;
    }
    const now = this.clock.now();
    const point = this.point();
    const day = this.points.dayFor(point);
    const tomorrow = addDays(instantToLocal(now).day, 1);
    return decideDayNotice({
      now,
      held: service.date,
      first: day?.date ?? null,
      firstOrderUntil: day?.orderUntil ?? null,
      tomorrowOrderUntil: this.seenLimits().get(`${point ?? ''}|${tomorrow}`) ?? null,
      byOperation: this.points.daysScopedToCart(),
    });
  });

  /** La phrase, ou `null` : rien à dire, la barre nomme déjà le jour retenu. */
  readonly message = computed<string | null>(() => this.say(this.decision()));

  constructor() {
    effect(() => {
      const point = this.point();
      const day = this.points.dayFor(point);
      const now = this.clock.now();
      untracked(() => {
        this.remember(point, day?.date ?? null, day?.orderUntil ?? null);
        this.refreshOnceWhenPassed(day?.orderUntil ?? null, now);
      });
    });
  }

  private remember(point: string | null, date: string | null, orderUntil: string | null): void {
    const key = `${point ?? ''}|${date ?? ''}`;
    if (date !== null && orderUntil !== null && this.seenLimits().get(key) !== orderUntil) {
      this.seenLimits.update((seen) => new Map(seen).set(key, orderUntil));
    }
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
    const service = this.order.choice();
    if (notice === null || service === null) {
      return null;
    }
    const copy = this.c();
    const locale = this.locale.current();
    const today = instantToLocal(this.clock.now()).day;
    const day = (date: string): string =>
      serviceDayLabel(date, today, locale, { today: copy.today, tomorrow: copy.tomorrow });
    const delivery = service.mode === 'delivery';
    switch (notice.kind) {
      case 'slipped':
        return fill(copy.slipped, { day: day(notice.held), next: day(notice.first) });
      case 'operation':
        return fill(copy.operationPickupFrom, { day: day(notice.first) });
      case 'late':
        return notice.passedAt === null
          ? fill(delivery ? copy.lateDelivery : copy.latePickup, { day: day(notice.held) })
          : fill(delivery ? copy.lateDeliveryAt : copy.latePickupAt, {
              day: day(notice.held),
              time: limitHourLabel(notice.passedAt, locale),
            });
      case 'countdown':
        return fill(copy.cutoffCountdown, {
          left: leftLabel(notice.minutesLeft, copy),
          day: weekdayLabel(notice.first, locale),
        });
      case 'calm':
        return fill(copy.cutoffCalm, {
          day: weekdayLabel(notice.first, locale),
          time: limitHourLabel(notice.until, locale),
        });
    }
  }
}
