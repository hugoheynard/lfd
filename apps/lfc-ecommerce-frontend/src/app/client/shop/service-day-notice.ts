import { computed, inject, Injectable } from '@angular/core';
import { addDays, instantToLocal } from '@lfd/contracts';

import { ClientLocale } from '../client-locale.service';
import { fill } from '../copy/client-copy.service';
import { commandTermsCopy } from '../copy/screens/command-terms.copy';
import { screenCopy } from '../copy/shop-copy-composer';
import { serviceDayLabel } from '../format-day';
import { OrderContextStore } from '../order-context.store';
import { ServicePoints } from './pickup-points.store';

/**
 * **Le jour de service n'est pas celui qu'on croit** — l'avertissement que la
 * barre et le panier montrent avant de régler.
 *
 * 🔴 Régression du 2026-10-13 (Hugo : « je croyais commander pour demain et au
 * final j'ai deux commandes pour jeudi ») : passé la limite de la veille, le
 * serveur accorde le surlendemain (`GET /fulfillment-days`), et la boutique le
 * disait en un mot discret au milieu de la barre. Deux cas, deux phrases :
 *
 * - le jour retenu est postérieur à demain → « Trop tard pour demain : … » ;
 * - le jour retenu est ANTÉRIEUR au premier jour que le serveur accorde
 *   encore — la limite est passée pendant la saisie → « Trop tard pour … ».
 *
 * ⚠️ « Demain » se lit à l'horloge du navigateur, à Paris : un LIBELLÉ, comme
 * partout où la boutique nomme une journée. La journée elle-même vient du
 * serveur. L'heure limite n'est pas dite : `FulfillmentDayView` ne la sert pas
 * (vérifié le 2026-10-13), et l'inventer serait affirmer une règle qu'on ne lit
 * pas.
 *
 * Un service et non un composant : deux surfaces le disent, et deux phrases du
 * même fait finissent par diverger.
 */
@Injectable({ providedIn: 'root' })
export class ServiceDayNotice {
  private readonly order = inject(OrderContextStore);
  private readonly points = inject(ServicePoints);
  private readonly locale = inject(ClientLocale);
  private readonly c = screenCopy('commandTerms', commandTermsCopy);

  /** La phrase d'avertissement, ou `null` quand le jour retenu est bien demain (ou aujourd'hui). */
  readonly message = computed<string | null>(() => {
    const service = this.order.choice();
    if (service === null) {
      return null;
    }
    const copy = this.c();
    const today = instantToLocal(new Date()).day;
    const say = (day: string): string =>
      serviceDayLabel(day, today, this.locale.current(), {
        today: copy.today,
        tomorrow: copy.tomorrow,
      });
    const first = this.points.nextDayFor(
      service.mode === 'pickup' ? service.pickupAddressId : null,
    );
    // Des jours `AAAA-MM-JJ` se comparent comme des chaînes.
    if (first !== null && service.date < first) {
      return fill(copy.slipped, { day: say(service.date), next: say(first) });
    }
    if (service.date > addDays(today, 1)) {
      const template = service.mode === 'delivery' ? copy.lateDelivery : copy.latePickup;
      return fill(template, { day: say(service.date) });
    }
    return null;
  });
}
