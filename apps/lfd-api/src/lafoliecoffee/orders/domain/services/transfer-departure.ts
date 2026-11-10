/**
 * **L'heure à laquelle un transfert interne doit partir** vers un site servi
 * par transfert, un jour donné (plan des sites, §4.6, lot T0).
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
 * Arrivée requise = référence − mise en place au comptoir ; départ requis =
 * arrivée requise − trajet. Un trajet inconnu (site ou départ sans GPS,
 * calcul routier injoignable) rend `null` : aucune durée n'est inventée.
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
  /** Durée du trajet, en minutes ; `null` = inconnue. */
  readonly travelMinutes: number | null;
}

export interface TransferDeparture {
  /** L'heure à laquelle le site doit pouvoir servir. */
  readonly reference: string;
  readonly arrivalBy: string;
  readonly departureBy: string;
}

const MINUTES_PER_HOUR = 60;

/**
 * Le départ requis, ou `null` s'il ne se calcule pas (aucune heure de
 * référence, ou trajet inconnu). Ramené à `00:00` au plus tôt : rien ne part
 * la veille (même règle que `deadlineThresholds`).
 */
export function transferDeparture(input: TransferDepartureInput): TransferDeparture | null {
  const reference = referenceMinute(input);
  if (reference === null || input.travelMinutes === null) {
    return null;
  }
  const arrival = Math.max(0, reference - input.counterSetupMinutes);
  const departure = Math.max(0, arrival - input.travelMinutes);
  return {
    reference: clockOf(reference),
    arrivalBy: clockOf(arrival),
    departureBy: clockOf(departure),
  };
}

/** Le plus tôt de l'ouverture pros et du premier créneau public ouvert ; sinon les commandes. */
function referenceMinute(input: TransferDepartureInput): number | null {
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
