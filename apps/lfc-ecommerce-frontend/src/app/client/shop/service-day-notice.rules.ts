import {
  addDays,
  instantToLocal,
  orderLimitInstant,
  type ShopItemOrderLimit,
} from '@lfd/contracts';

/**
 * **Au-delà de six heures, on ne compte pas.** « Plus que 8 h » à 15 h pour
 * une limite à 23 h presse sans raison ; « commandez avant 23 h » dit la même
 * chose calmement (Hugo, 2026-10-21).
 */
export const COUNTDOWN_THRESHOLD_MINUTES = 6 * 60;

const MINUTE_MS = 60_000;

/** Ce que la boutique sait du jour de service au moment où elle parle. */
export interface DayNoticeInput {
  /** L'instant présent — fourni, jamais lu ici. */
  readonly now: Date;
  /**
   * Le jour gardé par le choix du client, `AAAA-MM-JJ` — `null` quand rien
   * n'est encore choisi : la boutique annonce alors le premier jour de
   * l'entrée par défaut, et ne dit jamais « trop tard » (Hugo, 2026-10-21).
   */
  readonly held: string | null;
  /** Le premier jour que le serveur accorde, ou `null` s'il n'en dit rien. */
  readonly first: string | null;
  /** La limite annoncée de ce premier jour (ISO), ou `null` : aucune. */
  readonly firstOrderUntil: string | null;
  /** La limite de DEMAIN, si on l'a lue avant qu'elle tombe — sinon `null`. */
  readonly tomorrowOrderUntil: string | null;
  /** Les jours sont bornés par une opération datée que porte le panier. */
  readonly byOperation: boolean;
  /**
   * Les limites PROPRES des articles du panier — celles que le serveur sert
   * parce qu'elles sont plus strictes que la générale (2026-10-21). Vide : le
   * panier suit la règle générale.
   */
  readonly cartLimits: readonly CartItemLimit[];
}

/** Un article du panier qui porte sa propre limite. */
export interface CartItemLimit {
  /** Le nom de l'article, tel que la boutique l'affiche. */
  readonly name: string;
  readonly limit: ShopItemOrderLimit;
}

/**
 * Ce que la barre et le panier disent du jour de service. `null` = rien à
 * dire : la barre nomme déjà le jour retenu.
 */
export type DayNotice =
  /** Le jour gardé n'est plus demandable : la limite est passée pendant la saisie. */
  | { readonly kind: 'slipped'; readonly held: string; readonly first: string }
  /** Le panier porte une opération : c'est elle qui repousse le jour, pas la limite. */
  | { readonly kind: 'operation'; readonly first: string }
  /** Demain est VRAIMENT refusé : le premier jour accordé est postérieur. */
  | { readonly kind: 'late'; readonly held: string; readonly passedAt: Date | null }
  /**
   * La limite du premier jour tombe aujourd'hui, dans moins de six heures.
   * `item` : c'est la limite de CET article du panier qui décide — absent
   * quand c'est la règle générale.
   */
  | {
      readonly kind: 'countdown';
      readonly first: string;
      readonly minutesLeft: number;
      readonly item?: string;
    }
  /**
   * 🔴 La limite PROPRE d'un article du panier est déjà passée pour `day` :
   * la passation le refuserait (Hugo, 2026-10-21). `item` le premier article
   * dans ce cas, `others` combien d'autres, `next` le jour le plus tardif où
   * ils redeviennent tous possibles. L'emporte sur `calm` et `countdown`.
   */
  | {
      readonly kind: 'itemTooLate';
      readonly day: string;
      readonly item: string;
      readonly others: number;
      readonly next: string;
    }
  /** La limite du premier jour tombe aujourd'hui, plus tard. `item` : idem. */
  | { readonly kind: 'calm'; readonly first: string; readonly until: Date; readonly item?: string }
  | null;

/**
 * **Quoi dire du jour de service** — fonction pure, horloge injectée.
 *
 * 🔴 Régression du 2026-10-21 (démo de Hugo) : la boutique disait « Trop tard
 * pour demain » dès que le jour GARDÉ (localStorage) était postérieur à demain
 * — un jour choisi plus tôt, ou celui d'une opération —, alors que le serveur
 * accordait demain. « Trop tard » ne se dit plus que quand le PREMIER jour
 * accordé est postérieur à demain ; avant, on prévient.
 *
 * Sans choix (`held` à `null`, 2026-10-21) : seulement la forme calme ou le
 * compte à rebours du premier jour — jamais « trop tard », jamais « slipped ».
 */
export function decideDayNotice(input: DayNoticeInput): DayNotice {
  const { first, held } = input;
  if (first === null) {
    return null;
  }
  // Des jours `AAAA-MM-JJ` se comparent comme des chaînes.
  if (held !== null && held < first) {
    return { kind: 'slipped', held, first };
  }
  const tomorrow = addDays(instantToLocal(input.now).day, 1);
  if (first > tomorrow) {
    if (held === null) {
      // Rien n'est choisi : rien n'est « trop tard » pour la boutique, et
      // l'opération se dira au choix du jour — sauf un article du panier.
      return itemTooLate(first, first, input.now, input.cartLimits);
    }
    return input.byOperation
      ? { kind: 'operation', first }
      : { kind: 'late', held, passedAt: passedLimit(input.tomorrowOrderUntil, input.now) };
  }
  const tooLate = itemTooLate(held ?? first, first, input.now, input.cartLimits);
  if (tooLate !== null) {
    return tooLate;
  }
  const deciding = decidingLimit(first, input.firstOrderUntil, input.cartLimits);
  const notice = deadlineNotice(first, deciding.until, input.now);
  return notice === null || deciding.item === null ? notice : { ...notice, item: deciding.item };
}

/**
 * **Quelle limite décide pour ce jour** : la générale annoncée par le serveur,
 * ou celle d'un article du panier quand elle tombe AVANT — la plus fermée du
 * panier, la même règle que la passation (`ensureWithinOrderCutoff`). Sans
 * règle générale, la plus fermée des articles.
 */
function decidingLimit(
  day: string,
  general: string | null,
  cartLimits: readonly CartItemLimit[],
): { readonly until: string | null; readonly item: string | null } {
  if (cartLimits.length === 0) {
    return { until: general, item: null };
  }
  const announced = general === null ? null : new Date(general);
  let until = announced === null || Number.isNaN(announced.getTime()) ? null : announced;
  let item: string | null = null;
  for (const entry of cartLimits) {
    const at = orderLimitInstant({ ...entry.limit, graceMinutes: 0 }, day);
    if (at !== null && (until === null || at.getTime() < until.getTime())) {
      until = at;
      item = entry.name;
    }
  }
  return { until: until === null ? null : until.toISOString(), item };
}

/** Au-delà, on cesse de chercher : aucune limite d'article n'est si lointaine. */
const MAX_DAYS_AHEAD = 60;

/**
 * **Le premier jour où cet article est encore possible** — le plus petit jour
 * `≥ from` dont la limite propre (`daysBefore` jours avant, à `time` heure de
 * Paris, sans grâce) n'est pas encore passée à `now`. Fonction pure, horloge
 * injectée ; `null` si rien dans les {@link MAX_DAYS_AHEAD} jours.
 */
export function firstPossibleDay(
  limit: ShopItemOrderLimit,
  from: string,
  now: Date,
): string | null {
  for (let offset = 0; offset <= MAX_DAYS_AHEAD; offset += 1) {
    const day = addDays(from, offset);
    const at = orderLimitInstant({ ...limit, graceMinutes: 0 }, day);
    if (at !== null && now.getTime() < at.getTime()) {
      return day;
    }
  }
  return null;
}

/**
 * Les articles du panier dont la limite propre est passée pour `day` : le
 * premier nommé, le compte des autres, et le jour le plus tardif où ils
 * redeviennent tous possibles (cherché à partir de `first`, le premier jour
 * que le serveur accorde).
 */
function itemTooLate(
  day: string,
  first: string,
  now: Date,
  cartLimits: readonly CartItemLimit[],
): Extract<DayNotice, { readonly kind: 'itemTooLate' }> | null {
  const late = cartLimits.flatMap((entry) => {
    const at = orderLimitInstant({ ...entry.limit, graceMinutes: 0 }, day);
    if (at === null || now.getTime() < at.getTime()) {
      return [];
    }
    const next = firstPossibleDay(entry.limit, first, now);
    return next === null ? [] : [{ name: entry.name, next }];
  });
  const [head] = late;
  if (head === undefined) {
    return null;
  }
  const next = late.reduce(
    (latest, entry) => (entry.next > latest ? entry.next : latest),
    head.next,
  );
  return { kind: 'itemTooLate', day, item: head.name, others: late.length - 1, next };
}

/** La limite de demain, seulement si elle est bien passée. */
function passedLimit(iso: string | null, now: Date): Date | null {
  const at = iso === null ? null : new Date(iso);
  return at !== null && !Number.isNaN(at.getTime()) && at.getTime() < now.getTime() ? at : null;
}

/** Prévenir avant : seulement quand la limite tombe AUJOURD'HUI et n'est pas passée. */
function deadlineNotice(
  first: string,
  orderUntil: string | null,
  now: Date,
): Extract<DayNotice, { readonly kind: 'countdown' | 'calm' }> | null {
  const until = orderUntil === null ? null : new Date(orderUntil);
  if (until === null || Number.isNaN(until.getTime())) {
    return null;
  }
  const left = until.getTime() - now.getTime();
  if (left <= 0 || instantToLocal(until).day !== instantToLocal(now).day) {
    return null;
  }
  const minutesLeft = Math.max(1, Math.floor(left / MINUTE_MS));
  return minutesLeft > COUNTDOWN_THRESHOLD_MINUTES
    ? { kind: 'calm', first, until }
    : { kind: 'countdown', first, minutesLeft };
}

/**
 * Vrai quand une limite connue est tombée : la réponse du serveur ne vaut
 * plus, il faut relire `/fulfillment-days`.
 */
export function limitHasPassed(orderUntil: string | null, now: Date): boolean {
  return passedLimit(orderUntil, now) !== null;
}

/**
 * **Le jour retenu n'est plus possible** : la passation le refuserait
 * (`orders.cutoff.past`). Deux cas seulement — le jour choisi a glissé derrière
 * l'heure limite (`slipped`), ou la limite PROPRE d'un article du panier est
 * passée pour ce jour choisi (`itemTooLate`). Sans choix (`held` à `null`), rien
 * n'est « plus possible » : il n'y a encore rien à corriger (2026-10-26).
 */
export function dayNoLongerPossible(notice: DayNotice, held: string | null): boolean {
  if (notice === null || held === null) {
    return false;
  }
  return notice.kind === 'slipped' || notice.kind === 'itemTooLate';
}

/**
 * **L'encadré offre « Modifier »** : quand le jour retenu n'est plus possible,
 * et aussi quand la boutique a décalé d'elle-même le jour (`late`) — le client
 * peut préférer un autre jour que celui proposé (Hugo, 2026-10-26).
 */
export function offersDayChange(notice: DayNotice, held: string | null): boolean {
  return dayNoLongerPossible(notice, held) || (notice !== null && notice.kind === 'late');
}
