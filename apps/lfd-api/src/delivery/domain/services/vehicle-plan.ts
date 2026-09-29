import type { PlanningContext, PlanningVehicle } from "./proposal.js";
import { type RouteClock, type RoutingStop, type TimedRoute, timeRoute } from "./route-timing.js";

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
  /** Au plus tôt, en secondes depuis minuit : l'heure réglée, ou le retour de ce qu'il porte déjà. */
  readonly availableFrom: number;
  /** Combien de tournées gardées il fait avant : 0 si rien ne l'occupe. */
  readonly passagesBefore: number;
}

/** Un véhicule libre dès l'heure réglée. */
export function freeStart(ctx: PlanningContext): VehicleStart {
  return { availableFrom: openingOf(ctx), passagesBefore: 0 };
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
 * le reste en `cost` (marge, heures, tournées), et de combien ses tournées
 * dépassent la durée maximale — une borne, pas un prix.
 */
export interface VehicleScore {
  readonly lateSeconds: number;
  readonly cost: number;
  readonly overSeconds: number;
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
  };
}

/** L'heure au plus tôt des réglages, en secondes depuis minuit. */
export function openingOf(ctx: PlanningContext): number {
  return ctx.settings.earliestDepartureMinute * SECONDS_PER_MINUTE;
}

/** La durée maximale d'une tournée, en secondes. */
export function maxSecondsOf(ctx: PlanningContext): number {
  return ctx.settings.maxRoundMinutes * SECONDS_PER_MINUTE;
}

/**
 * Chronomètre les tournées d'un véhicule (Q13) : la première part au plus tôt
 * à `from` ; chacune des suivantes, au plus tôt au retour de la précédente.
 */
export function timeVehicle(
  ctx: PlanningContext,
  routes: Routes,
  from: number,
): readonly TimedRoute[] {
  const timed: TimedRoute[] = [];
  let earliest = from;
  for (const { stops } of routes) {
    const route = timeRoute(ctx.depotId, stops, ctx.cost, clockOf(ctx, earliest));
    timed.push(route);
    earliest = route.return;
  }
  return timed;
}

/**
 * **Le coût d'un véhicule** (L7b-C2, L7t-C1) : les secondes hors créneau à
 * part ; en `cost`, les secondes d'arrivée dans la marge de sécurité
 * (`MARGIN_WEIGHT` chacune), les minutes de route, d'attente et de livraison
 * (départ → retour), et chaque tournée ouverte — alourdie pour un second
 * passage, y compris quand le premier est une tournée gardée (L7t-C2). Une
 * tournée vide ne coûte rien. Le dépassement de la durée maximale est rendu À
 * PART : c'est une borne, pas un prix — un geste qui l'augmente est refusé.
 *
 * Le véhicule part au plus tôt à `start.availableFrom` (L7t-C2).
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
  const maxSeconds = maxSecondsOf(ctx);
  const defaultStop = ctx.settings.stopMinutes * SECONDS_PER_MINUTE;
  const margin = ctx.settings.safetyMarginMinutes * SECONDS_PER_MINUTE;
  let cost = 0;
  let lateSeconds = 0;
  let overSeconds = 0;
  let opened = start.passagesBefore;
  let earliest = start.availableFrom;
  for (const { stops } of routes) {
    const first = stops[0];
    if (first === undefined) {
      continue;
    }
    const firstStart = first.window?.start ?? null;
    const departure =
      firstStart === null
        ? earliest
        : Math.max(earliest, firstStart - ctx.cost.seconds(ctx.depotId, first.id));
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
      ROUND_OPENING_SECONDS +
      (opened > 0 ? passagePenaltyOf(ctx) : 0);
    overSeconds += Math.max(0, duration - maxSeconds);
    opened += 1;
    earliest = back;
  }
  return { lateSeconds, cost, overSeconds };
}
