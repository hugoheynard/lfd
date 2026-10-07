import type { PlanningContext, PlanningVehicle } from "./proposal.js";
import {
  DAY_START,
  departureOf,
  latestDepartures,
  type RouteClock,
  type RoutingStop,
  type TimedRoute,
  timeChain,
} from "./route-timing.js";

const SECONDS_PER_MINUTE = 60;

/**
 * **L'ordre des priorités du calcul** (lot 7 ter, L7t-C1 — Hugo, 2026-09-29 :
 * « on maximise pour le client ») :
 *
 * 1. **jamais hors créneau** — les secondes de retard ne se mélangent pas au
 *    reste : `VehicleScore.lateSeconds` est comparé AVANT `cost`
 *    (`isBetterScore`). Une composition sans retard bat donc TOUJOURS une
 *    composition avec, quel que soit son prix en heures ou en tournées. Le
 *    créneau reste une contrainte douce — on livre quand même, signalé
 *    (L7-C4) — mais un retard n'est rendu que faute de toute autre place ;
 * 2. **la marge de sécurité** — arriver dans les `safetyMarginMinutes`
 *    dernières minutes d'un créneau coûte `MARGIN_WEIGHT` fois chaque seconde
 *    dans la marge : moins qu'un retard (qui domine), plus qu'une seconde de
 *    livreur ;
 * 3. **ensuite seulement**, les heures de livreur (route, attente, livraison)
 *    et les tournées ouvertes.
 *
 * Remplace `LATE_WEIGHT` (cent minutes de route par minute de retard, lot 7
 * bis) : un poids, même lourd, se laisse racheter par assez de tournées
 * évitées ; un ordre, non.
 */
export const MARGIN_WEIGHT = 10;

/**
 * **Partir tôt coûte** (Hugo, 2026-10-07 : « le plus tard on part, plus on a
 * de temps pour la prod et le colisage »). Chaque seconde de départ AVANT
 * l'heure réglée « au plus tôt » (`earliestDeparture`) coûte ce poids-là, en
 * secondes de livreur : deux camionnettes qui partent à 4 h 30 battent une
 * seule qui part à 2 h pour tenir deux échéances dans deux vallées.
 *
 * Remplace CA-D1/CA2 (2026-10-03 : « même à 2 h », « aucune pénalité ») sur
 * ce seul point : un retard domine toujours (`isBetterScore`), donc on part
 * encore tôt quand c'est le seul moyen de tenir une échéance.
 */
export const EARLY_WEIGHT = 2;

/**
 * Ouvrir une tournée coûte une heure (L7b-C2, C3) : c'est le prix qu'on met
 * sur un aller-retour de plus, un chargement de plus, un livreur de plus. Une
 * heure d'attente ou de détour coûte donc moins qu'une tournée ouverte pour un
 * arrêt que la tournée existante pouvait prendre.
 */
export const ROUND_OPENING_SECONDS = 60 * SECONDS_PER_MINUTE;

/**
 * Une tournée pendant le calcul. `roundId` nomme une tournée EXISTANTE (mode
 * `insert`) : vidée, elle reste là, vide ; une tournée neuve (`null`) vidée
 * disparaît.
 */
export interface PlanRoute {
  readonly roundId: string | null;
  readonly stops: readonly RoutingStop[];
}

/**
 * Un second passage coûte EN PLUS la durée maximale d'une tournée (L7b-C3) :
 * il n'est ouvert que si la journée ne tient pas autrement. Toute place qui
 * tient dans une tournée existante — au plus la durée maximale de plus — ou
 * dans la première tournée d'un véhicule libre coûte moins.
 */
function passagePenaltyOf(ctx: PlanningContext): number {
  return maxSecondsOf(ctx);
}

/** Les tournées d'un véhicule, dans l'ordre de leurs passages. */
export type Routes = readonly PlanRoute[];

/**
 * D'où part un véhicule (lot 7 ter, L7t-C2) : une camionnette qui porte une
 * tournée gardée chargée ou partie n'est libre qu'à son retour estimé, et sa
 * première tournée proposée y est déjà un SECOND passage.
 */
export interface VehicleStart {
  /** Au plus tôt, en secondes depuis minuit : minuit du jour, ou le retour de ce qu'il porte déjà. */
  readonly availableFrom: number;
  /** Combien de tournées gardées il fait avant : 0 si rien ne l'occupe. */
  readonly passagesBefore: number;
}

/**
 * Un véhicule libre dès minuit du jour (CA2, Q1) : l'heure réglée n'est plus
 * un plancher — elle ne ferait qu'arriver en retard.
 */
export function freeStart(_ctx: PlanningContext): VehicleStart {
  return { availableFrom: DAY_START, passagesBefore: 0 };
}

/** Un véhicule pendant le calcul. */
export interface VehiclePlan extends VehicleStart {
  readonly vehicle: PlanningVehicle;
  /** Combien de tournées il peut porter au plus ; `Infinity` : autant qu'il en faut. */
  readonly maxRoutes: number;
  readonly routes: Routes;
}

/**
 * Ce qu'un véhicule coûte : ses secondes hors créneau À PART (priorité 1),
 * le reste en `cost` (marge, heures, tournées). La durée maximale d'une
 * tournée n'y figure plus comme borne (CA2, Q2) : elle cède devant la
 * règle 1 et n'est plus qu'un signal (`overDuration`).
 */
export interface VehicleScore {
  readonly lateSeconds: number;
  readonly cost: number;
}

/** Une différence plus petite que ça est du bruit de virgule flottante. */
const EPSILON = 1e-6;

/**
 * `a` est-il STRICTEMENT meilleur que `b` (L7t-C1) ? Moins de retard d'abord ;
 * à retard égal, moins cher. Sert aussi aux écarts (`lateSeconds` et `cost`
 * d'un surcoût), qui se comparent de la même façon.
 */
export function isBetterScore(
  a: Pick<VehicleScore, "lateSeconds" | "cost">,
  b: Pick<VehicleScore, "lateSeconds" | "cost">,
): boolean {
  if (a.lateSeconds < b.lateSeconds - EPSILON) {
    return true;
  }
  return a.lateSeconds <= b.lateSeconds + EPSILON && a.cost < b.cost - EPSILON;
}

/** L'horloge d'une tournée qui ne part pas avant `earliest`. */
export function clockOf(ctx: PlanningContext, earliest: number): RouteClock {
  return {
    earliestDeparture: earliest,
    stopSeconds: ctx.settings.stopMinutes * SECONDS_PER_MINUTE,
    idleDeparture: idleDepartureOf(ctx),
    safetySeconds: ctx.settings.safetyMarginMinutes * SECONDS_PER_MINUTE,
  };
}

/**
 * L'heure réglée « au plus tôt », en secondes depuis minuit. Depuis CA2 ce
 * n'est plus un plancher : c'est le départ d'une tournée qu'aucune échéance
 * ne presse (`RouteClock.idleDeparture`).
 */
export function idleDepartureOf(ctx: PlanningContext): number {
  return ctx.settings.earliestDepartureMinute * SECONDS_PER_MINUTE;
}

/** La durée maximale d'une tournée, en secondes. */
export function maxSecondsOf(ctx: PlanningContext): number {
  return ctx.settings.maxRoundMinutes * SECONDS_PER_MINUTE;
}

/**
 * Chronomètre les tournées d'un véhicule (Q13, CA2) : au plus tard qui tient
 * toutes les échéances du véhicule, la première jamais avant `from`, chacune
 * des suivantes jamais avant le retour de la précédente (`timeChain`).
 */
export function timeVehicle(
  ctx: PlanningContext,
  routes: Routes,
  from: number,
): readonly TimedRoute[] {
  return timeChain(
    ctx.depotId,
    routes.map(({ stops }) => stops),
    ctx.cost,
    clockOf(ctx, from),
  );
}

/**
 * **Le coût d'un véhicule** (L7b-C2, L7t-C1) : les secondes hors créneau à
 * part ; en `cost`, les secondes d'arrivée dans la marge de sécurité
 * (`MARGIN_WEIGHT` chacune), les minutes de route, d'attente et de livraison
 * (départ → retour), chaque seconde de départ avant l'heure « au plus tôt »
 * (`EARLY_WEIGHT`, 2026-10-07), et chaque tournée ouverte — alourdie pour un second
 * passage, y compris quand le premier est une tournée gardée (L7t-C2). Une
 * tournée vide ne coûte rien. La durée maximale ne refuse rien (CA2, Q2).
 *
 * Chaque tournée part au plus tard qui tient les échéances du véhicule
 * (`latestDepartures`, CA2), jamais avant `start.availableFrom` (L7t-C2) ni
 * avant le retour du passage précédent.
 *
 * Appelé des dizaines de milliers de fois par proposition : il refait le
 * chronométrage de `timeRoute` sans rien allouer. Les deux doivent rester
 * identiques — `vehicle-plan.spec.ts` le vérifie.
 */
export function scoreVehicle(
  ctx: PlanningContext,
  routes: Routes,
  start: VehicleStart,
): VehicleScore {
  const clock = clockOf(ctx, start.availableFrom);
  const defaultStop = clock.stopSeconds;
  const margin = clock.safetySeconds ?? 0;
  const all = routes.map(({ stops }) => stops);
  const latest = latestDepartures(ctx.depotId, all, ctx.cost, clock);
  let cost = 0;
  let lateSeconds = 0;
  let opened = start.passagesBefore;
  let earliest = start.availableFrom;
  for (const [index, stops] of all.entries()) {
    if (stops.length === 0) {
      continue;
    }
    const routeClock = { ...clock, earliestDeparture: earliest };
    const departure = departureOf(
      ctx.depotId,
      stops,
      ctx.cost,
      routeClock,
      latest[index] ?? Infinity,
    );
    let at = departure;
    let inMargin = 0;
    let previous = ctx.depotId;
    for (const stop of stops) {
      at += ctx.cost.seconds(previous, stop.id);
      const window = stop.window;
      if (window !== null) {
        lateSeconds += Math.max(0, at - window.end);
        at = Math.max(at, window.start ?? at);
        inMargin += Math.max(0, Math.min(at, window.end) - (window.end - margin));
      }
      at += stop.stopSeconds ?? defaultStop;
      previous = stop.id;
    }
    const back = at + ctx.cost.seconds(previous, ctx.depotId);
    const duration = back - departure;
    cost +=
      duration +
      MARGIN_WEIGHT * inMargin +
      EARLY_WEIGHT * Math.max(0, idleDepartureOf(ctx) - departure) +
      ROUND_OPENING_SECONDS +
      (opened > 0 ? passagePenaltyOf(ctx) : 0);
    opened += 1;
    earliest = back;
  }
  return { lateSeconds, cost };
}
