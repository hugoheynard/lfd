/**
 * **L'heure à laquelle un transfert interne doit arriver, puis partir**, vers
 * un site servi par transfert, un jour donné (plan des sites, §4.6).
 *
 * Fonction pure : ni horloge, ni base, ni réseau. Ce qu'elle reçoit est déjà
 * réduit au jour demandé — la règle du jour de semaine et des fermetures datées
 * appartient à qui lit l'horaire ; celle qui combine les heures est ici.
 *
 * ## L'heure de référence (Q-T12, proposée au plan le 2026-10-13)
 *
 * Le plus tôt entre l'ouverture **pros** du site et le **premier créneau
 * public ouvert** ce jour-là. Sans l'un ni l'autre : le plus tôt des créneaux
 * **des commandes** du site. Sans rien : `null`, et les commandes passent en
 * `UNDATED` (comme une commande sans fenêtre).
 *
 * ## L'arrivée est la plus faible échéance de ce que le transfert porte
 *
 * Règle de Hugo du 2026-11-24 : arrivée requise = la plus tôt de
 * « référence − mise en place au comptoir » et de l'heure des réassorts
 * « pour demain » du point. L'ouverture reste un plancher : un réassort plus
 * tardif ne retarde rien. Sans référence, l'heure des réassorts seule.
 *
 * L'arrivée ne dépend pas du trajet. Le départ requis = arrivée − trajet ; un
 * trajet inconnu (site ou départ sans GPS, calcul routier injoignable) rend un
 * départ `null`, aucune durée n'est inventée, mais l'arrivée reste.
 */

/** Une fenêtre `HH:mm` ; `start` nul = échéance seule (la fin fait foi). */
export interface ClockWindow {
  readonly start: string | null;
  readonly end: string;
}

/** Une règle de créneaux publics du jour, découpée au pas `slotMinutes`. */
export interface PublicSlotRuleOfDay {
  readonly start: string;
  readonly end: string;
  readonly slotMinutes: number;
}

/** Une fermeture datée qui couvre le jour ; bornes nulles = la journée entière. */
export interface PublicClosureOfDay {
  readonly start: string | null;
  readonly end: string | null;
}

export interface TransferDepartureInput {
  /** Le créneau réservé aux pros du site, ou `null`. */
  readonly proPickup: ClockWindow | null;
  readonly publicRules: readonly PublicSlotRuleOfDay[];
  readonly publicClosures: readonly PublicClosureOfDay[];
  /** Les fenêtres des commandes du site ce jour-là — le repli. */
  readonly orderWindows: readonly ClockWindow[];
  /** ≥ 0, tenu par l'agrégat `Site`. */
  readonly counterSetupMinutes: number;
  /**
   * La plus tôt des heures (`HH:mm`) des réassorts « pour demain » du point,
   * déjà une ARRIVÉE (la mise en place n'en est pas retirée) ; `null` = aucun.
   */
  readonly resupplyArrival: string | null;
  /** Durée du trajet, en minutes ; `null` = inconnue. */
  readonly travelMinutes: number | null;
}

export interface TransferDeparture {
  readonly arrivalBy: string;
  /** `null` = trajet inconnu : l'arrivée, elle, se tient quand même. */
  readonly departureBy: string | null;
}

const MINUTES_PER_HOUR = 60;

/** Ce que l'heure d'arrivée requise du POINT lit : ni trajet, ni réassorts. */
export type RequiredArrivalInput = Omit<
  TransferDepartureInput,
  "travelMinutes" | "resupplyArrival"
>;

/**
 * L'heure à laquelle ce qui sert le point doit y ÊTRE — référence moins la
 * mise en place, `HH:mm` — ou `null` sans heure de référence. Elle ne
 * dépend pas du trajet : un point servi sur place la tient aussi (le
 * réassort « monté pour »). Ramenée à `00:00` au plus tôt.
 *
 * Sans les réassorts : c'est l'heure qu'on PROPOSE à un réassort, et un
 * réassort à 05:30 ne doit pas proposer 05:30 au suivant.
 */
export function requiredArrival(input: RequiredArrivalInput): string | null {
  const arrival = arrivalMinute(input);
  return arrival === null ? null : clockOf(arrival);
}

/**
 * L'arrivée requise du transfert — la plus tôt de celle du point et des
 * réassorts —, ou `null` s'il n'y a ni référence ni réassort daté.
 */
export function transferArrival(
  input: Omit<TransferDepartureInput, "travelMinutes">,
): string | null {
  const minutes = [
    arrivalMinute(input),
    input.resupplyArrival === null ? null : minuteOf(input.resupplyArrival),
  ].filter((minute): minute is number => minute !== null);
  return minutes.length === 0 ? null : clockOf(Math.min(...minutes));
}

/**
 * L'arrivée et le départ requis, ou `null` sans aucune arrivée. Le départ est
 * ramené à `00:00` au plus tôt : rien ne part la veille (même règle que
 * `deadlineThresholds`).
 */
export function transferDeparture(input: TransferDepartureInput): TransferDeparture | null {
  const arrivalBy = transferArrival(input);
  if (arrivalBy === null) {
    return null;
  }
  const departureBy =
    input.travelMinutes === null
      ? null
      : clockOf(Math.max(0, minuteOf(arrivalBy) - input.travelMinutes));
  return { arrivalBy, departureBy };
}

function arrivalMinute(input: RequiredArrivalInput): number | null {
  const reference = referenceMinute(input);
  return reference === null ? null : Math.max(0, reference - input.counterSetupMinutes);
}

/** Le plus tôt de l'ouverture pros et du premier créneau public ouvert ; sinon les commandes. */
function referenceMinute(input: RequiredArrivalInput): number | null {
  const site = [
    input.proPickup === null ? null : windowMinute(input.proPickup),
    firstOpenPublicSlot(input.publicRules, input.publicClosures),
  ].filter((minute): minute is number => minute !== null);
  if (site.length > 0) {
    return Math.min(...site);
  }
  const orders = input.orderWindows.map(windowMinute);
  return orders.length > 0 ? Math.min(...orders) : null;
}

/**
 * Le début du premier créneau public qu'aucune fermeture ne recouvre. Un
 * créneau est fermé dès qu'une fermeture l'entame : on ne promet pas un
 * créneau à moitié ouvert.
 */
export function firstOpenPublicSlot(
  rules: readonly PublicSlotRuleOfDay[],
  closures: readonly PublicClosureOfDay[],
): number | null {
  const spans = closures.map(closureSpan);
  let first: number | null = null;
  for (const rule of rules) {
    const end = minuteOf(rule.end);
    // Un pas nul ne découpe rien : la règle entière est alors un seul créneau.
    const step = rule.slotMinutes > 0 ? rule.slotMinutes : end - minuteOf(rule.start);
    for (let start = minuteOf(rule.start); start < end; start += step) {
      const slotEnd = Math.min(end, start + step);
      if (!spans.some((span) => span.from < slotEnd && start < span.to)) {
        first = first === null ? start : Math.min(first, start);
        break;
      }
    }
  }
  return first;
}

function closureSpan(closure: PublicClosureOfDay): { readonly from: number; readonly to: number } {
  return {
    from: closure.start === null ? 0 : minuteOf(closure.start),
    to: closure.end === null ? Number.POSITIVE_INFINITY : minuteOf(closure.end),
  };
}

/** La règle du compte à rebours : le début d'une fenêtre, sinon sa fin. */
function windowMinute(window: ClockWindow): number {
  return minuteOf(window.start ?? window.end);
}

function minuteOf(clock: string): number {
  const [hours = 0, minutes = 0] = clock.split(":").map(Number);
  return hours * MINUTES_PER_HOUR + minutes;
}

function clockOf(minute: number): string {
  const hours = Math.floor(minute / MINUTES_PER_HOUR);
  const minutes = minute % MINUTES_PER_HOUR;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
