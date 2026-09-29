import type {
  DeliveryRoundOrderRef,
  DeliveryRoundStopSignal,
  DeliveryRoundStopView,
  DeliveryRoundView,
  DeliveryRoundsDayView,
  DeliveryRunSheetStopView,
  DeliveryRunSheetView,
  HandoverQueueWindowView,
  VehicleView,
} from '@lfd/contracts';

import { parisDayOf } from './run-sheet';

/**
 * Les dérivations pures de la composition des tournées
 * (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 3).
 *
 * Type-only sur le contrat, comme `run-sheet.ts` : une valeur importée de
 * `@lfd/contracts` tirerait zod dans le paquet de la page.
 */

const MINUTES_PER_HOUR = 60;

/** Un arrêt de tournée, joint à sa ligne de feuille de route — `null` si la feuille du jour ne la connaît pas. */
export interface ComposedStop {
  readonly stop: DeliveryRoundStopView;
  readonly sheet: DeliveryRunSheetStopView | null;
  /** La référence de l'arrêt placé AVANT celui-ci et dont la fenêtre commence après la fin de la sienne (C8). */
  readonly windowClash: string | null;
}

/** Une tournée, arrêts joints. */
export interface ComposedRound {
  readonly round: DeliveryRoundView;
  readonly stops: readonly ComposedStop[];
}

/** Une commande à répartir, jointe à sa ligne de feuille de route. */
export interface ComposedOrder {
  readonly order: DeliveryRoundOrderRef;
  readonly sheet: DeliveryRunSheetStopView | null;
}

/** La composition d'un jour, jointe à la feuille de route LUE AU MÊME MOMENT (C16). */
export interface ComposedDay {
  readonly rounds: readonly ComposedRound[];
  readonly unassigned: readonly ComposedOrder[];
}

function minutesOf(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/u.exec(time);
  return match === null ? null : Number(match[1]) * MINUTES_PER_HOUR + Number(match[2]);
}

/**
 * Le signal de fenêtre de C8, le seul qui se voit sans carte : pour chaque
 * arrêt, la référence du premier arrêt placé avant lui dont la fenêtre
 * **commence** après la **fin** de la sienne. On y arriverait trop tard.
 *
 * Un arrêt sans fenêtre ne se plaint pas, et une fenêtre sans début
 * (« avant 10 h ») ne bloque personne.
 */
export function windowClashes(
  stops: readonly { readonly reference: string; readonly window: HandoverQueueWindowView | null }[],
): readonly (string | null)[] {
  return stops.map((current, index) => {
    const end = current.window === null ? null : minutesOf(current.window.end);
    if (end === null) {
      return null;
    }
    const blocker = stops.slice(0, index).find((earlier) => {
      const start = earlier.window?.start;
      const startMinutes = start === null || start === undefined ? null : minutesOf(start);
      return startMinutes !== null && startMinutes > end;
    });
    return blocker?.reference ?? null;
  });
}

/** Joint la composition et la feuille de route par `orderId` — sans rien décider avec. */
export function composeDay(
  rounds: DeliveryRoundsDayView,
  sheet: DeliveryRunSheetView,
): ComposedDay {
  const byOrder = new Map(sheet.stops.map((stop) => [stop.orderId, stop]));
  return {
    rounds: rounds.rounds.map((round) => {
      const joined = round.stops.map((stop) => ({
        stop,
        sheet: byOrder.get(stop.orderId) ?? null,
      }));
      const clashes = windowClashes(
        joined.map((line) => ({
          reference: line.stop.reference,
          window: line.sheet?.window ?? null,
        })),
      );
      return {
        round,
        stops: joined.map((line, index) => ({ ...line, windowClash: clashes[index] ?? null })),
      };
    }),
    unassigned: rounds.unassigned.map((order) => ({
      order,
      sheet: byOrder.get(order.orderId) ?? null,
    })),
  };
}

/**
 * La permutation complète après avoir déplacé l'arrêt `index` de `delta`
 * (−1 monte, +1 descend) — `null` s'il est déjà au bord. Le serveur exige la
 * liste ENTIÈRE (I2), jamais un échange de deux lignes.
 */
export function shiftedOrder(
  stopIds: readonly string[],
  index: number,
  delta: -1 | 1,
): readonly string[] | null {
  const target = index + delta;
  const moving = stopIds[index];
  const other = stopIds[target];
  if (moving === undefined || other === undefined) {
    return null;
  }
  const next = [...stopIds];
  next[index] = other;
  next[target] = moving;
  return next;
}

/** « Kangoo blanc », puis « Kangoo blanc · passage 2 » dès le second passage (Q13). */
export function roundLabel(round: Pick<DeliveryRoundView, 'vehicleName' | 'passage'>): string {
  return round.passage > 1
    ? `${round.vehicleName} · passage ${String(round.passage)}`
    : round.vehicleName;
}

/** « aucun arrêt », « 1 arrêt », « 4 arrêts » — pour voir un déséquilibre. */
export function stopCountLabel(count: number): string {
  if (count === 0) {
    return 'aucun arrêt';
  }
  return count === 1 ? '1 arrêt' : `${String(count)} arrêts`;
}

/**
 * Un véhicule peut porter une tournée du jour `day` s'il n'est pas retiré, ou
 * si le jour (Paris) de son retrait est `day` ou après (C14). Le serveur refuse
 * de toute façon : ceci ne fait que ne pas proposer ce qui serait refusé.
 */
export function vehiclesActiveOn(
  vehicles: readonly VehicleView[],
  day: string,
): readonly VehicleView[] {
  return vehicles.filter(
    (vehicle) => vehicle.retiredAt === null || parisDayOf(new Date(vehicle.retiredAt)) >= day,
  );
}

const SERVICE_DAY = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/** « mercredi 30 septembre » — un `AAAA-MM-JJ` lu comme date seule. */
export function serviceDayLabel(isoDay: string): string {
  return SERVICE_DAY.format(new Date(`${isoDay}T00:00:00Z`));
}

/** Ce qui cloche sur un arrêt, en toutes lettres (Q11 : à retirer à la main). */
export function signalLabel(signal: DeliveryRoundStopSignal, orderDay: string | null): string {
  switch (signal) {
    case 'cancelled':
      return 'Commande annulée';
    case 'not_this_day':
      return orderDay === null
        ? 'N’est plus livrée ce jour'
        : `Livrée désormais le ${serviceDayLabel(orderDay)}`;
    case 'not_delivery':
      return 'Passée en retrait au comptoir';
  }
}
