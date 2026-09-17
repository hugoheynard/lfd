import { addDays } from '@lfd/contracts';

import type { LocaleCode } from './client-locale.service';

/** Les deux jours qui se disent d'un mot plutôt que d'une date. */
export interface NearDays {
  readonly today: string;
  readonly tomorrow: string;
}

/**
 * **La journée de service**, telle qu'on la dit : « aujourd'hui », « demain »,
 * sinon « jeudi 17 septembre ».
 *
 * 🔴 Le panier écrivait « demain » en dur, alors que la journée vient du serveur
 * (`GET /fulfillment-days`) et dépend de l'heure limite du point : Le Village
 * sert le surlendemain, et le panier annonçait quand même demain (corrigé le
 * 2026-09-15).
 *
 * `day` et `today` sont des jours `AAAA-MM-JJ` d'Europe/Paris. La date se met en
 * forme à midi UTC, fuseau UTC : aucun décalage ne peut la faire changer de jour.
 */
/**
 * **Le moment retenu**, tel qu'on le dit : « Demain 7 h 15 ».
 *
 * 🔴 Une seule fonction pour les deux surfaces qui l'affichent — le rail des
 * étapes et le récapitulatif de commande. Elles le composaient chacune de leur
 * côté, et deux formulations du même fait à trente pixels l'une de l'autre
 * finissent toujours par diverger d'un séparateur ou d'une majuscule.
 *
 * `slot` est le libellé DÉJÀ mis en forme par celui qui a posé le choix — on ne
 * le reformate pas ici : il peut dire « 7 h 15 » comme « avant 8 h ».
 */
export function serviceWhenLabel(
  day: string,
  slot: string,
  today: string,
  locale: LocaleCode,
  near: NearDays,
): string {
  return `${serviceDayLabel(day, today, locale, near)} ${slot}`;
}

export function serviceDayLabel(
  day: string,
  today: string,
  locale: LocaleCode,
  near: NearDays,
): string {
  if (day === today) {
    return near.today;
  }
  if (day === addDays(today, 1)) {
    return near.tomorrow;
  }
  const instant = new Date(`${day}T12:00:00.000Z`);
  if (Number.isNaN(instant.getTime())) {
    // Une date illisible se montre telle quelle plutôt qu'en « Invalid Date ».
    return day;
  }
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(instant);
}
