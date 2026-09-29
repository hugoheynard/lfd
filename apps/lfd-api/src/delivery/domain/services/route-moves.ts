import type { MoveScope } from "./move-scope.js";
import type { RoutingStop } from "./route-timing.js";
import type { PlanRoute, Routes, VehiclePlan } from "./vehicle-plan.js";

/**
 * **Les gestes de l'amélioration locale** (L7b-C2) : chacun rend les tournées
 * NOUVELLES des véhicules qu'il touche, jamais une mutation. Une tournée
 * vidée par un geste disparaît — une tournée ouverte de moins.
 *
 * 🔴 Un arrêt ÉPINGLÉ (placé à la main, mode `insert`) ne bouge jamais, et
 * une tournée qui en porte un n'est ni réordonnée, ni coupée : on peut y
 * insérer ou en retirer un arrêt libre, et c'est tout — l'ordre relatif des
 * arrêts placés à la main ne change pas (L7b-C3).
 *
 * Entre tournées, un geste ne crée que des liens entre voisins proches
 * (`MoveScope.near`, liste granulaire) ; dans une tournée, tout est essayé.
 *
 * Les voisinages sont parcourus dans un ordre fixe : même entrée, même suite
 * de gestes.
 */

/** Un geste : les tournées nouvelles de chaque véhicule touché. */
export type Move = readonly { readonly vehicle: number; readonly routes: Routes }[];

/** Or-opt déplace des segments de 1 à 3 arrêts (architecture des tournées, §7). */
const OR_OPT_MAX_SEGMENT = 3;

/** Une tournée repérée : son véhicule, son rang chez lui. */
interface Slot {
  readonly vehicle: number;
  readonly route: number;
  readonly stops: readonly RoutingStop[];
}

function slotsOf(plans: readonly VehiclePlan[]): readonly Slot[] {
  return plans.flatMap((plan, vehicle) =>
    plan.routes.map(({ stops }, route) => ({ vehicle, route, stops })),
  );
}

/**
 * Les tournées d'un véhicule, une ou deux remplacées ; une tournée NEUVE
 * vidée disparaît. Sans `Map` ni copie des tournées intactes : c'est le
 * chemin chaud de la recherche.
 */
function replaced(
  routes: Routes,
  first: number,
  firstStops: readonly RoutingStop[],
  second = first,
  secondStops = firstStops,
): Routes {
  const result: PlanRoute[] = [];
  for (let index = 0; index < routes.length; index += 1) {
    const route = routes[index];
    if (route === undefined) {
      continue;
    }
    const stops = index === first ? firstStops : index === second ? secondStops : route.stops;
    if (stops === route.stops) {
      result.push(route);
    } else if (route.roundId !== null || stops.length > 0) {
      result.push({ roundId: route.roundId, stops });
    }
  }
  return result;
}

/** Un geste sur deux tournées, du même véhicule ou non. */
function pairMove(
  plans: readonly VehiclePlan[],
  a: Slot,
  newA: readonly RoutingStop[],
  b: Slot,
  newB: readonly RoutingStop[],
): Move {
  const routesOf = (vehicle: number): Routes => plans[vehicle]?.routes ?? [];
  if (a.vehicle === b.vehicle) {
    return [
      { vehicle: a.vehicle, routes: replaced(routesOf(a.vehicle), a.route, newA, b.route, newB) },
    ];
  }
  return [
    { vehicle: a.vehicle, routes: replaced(routesOf(a.vehicle), a.route, newA) },
    { vehicle: b.vehicle, routes: replaced(routesOf(b.vehicle), b.route, newB) },
  ];
}

const hasPinned = (stops: readonly RoutingStop[], pinned: ReadonlySet<string>): boolean =>
  stops.some((stop) => pinned.has(stop.id));

/** Dans une tournée sans épingle : Or-opt, puis 2-opt. */
export function* intraRouteMoves(plans: readonly VehiclePlan[], scope: MoveScope): Generator<Move> {
  if (scope.crossOnly) {
    return;
  }
  for (const slot of slotsOf(plans)) {
    if (hasPinned(slot.stops, scope.pinned)) {
      continue;
    }
    const routes = plans[slot.vehicle]?.routes ?? [];
    for (const stops of reorderings(slot.stops, scope)) {
      yield [{ vehicle: slot.vehicle, routes: replaced(routes, slot.route, stops) }];
    }
  }
}

/** Or-opt puis 2-opt, restreints aux gestes qui créent un lien entre proches. */
function* reorderings(
  sequence: readonly RoutingStop[],
  scope: MoveScope,
): Generator<readonly RoutingStop[]> {
  const id = (index: number): string | null => sequence[index]?.id ?? null;
  for (let length = 1; length <= OR_OPT_MAX_SEGMENT; length += 1) {
    for (let from = 0; from + length <= sequence.length; from += 1) {
      const segment = sequence.slice(from, from + length);
      const rest = [...sequence.slice(0, from), ...sequence.slice(from + length)];
      for (let to = 0; to <= rest.length; to += 1) {
        const joins =
          scope.near(rest[to - 1]?.id ?? null, segment[0]?.id ?? null) ||
          scope.near(segment.at(-1)?.id ?? null, rest[to]?.id ?? null);
        if (to !== from && joins) {
          yield [...rest.slice(0, to), ...segment, ...rest.slice(to)];
        }
      }
    }
  }
  for (let i = 0; i < sequence.length - 1; i += 1) {
    for (let j = i + 1; j < sequence.length; j += 1) {
      if (!scope.near(id(i - 1), id(j)) && !scope.near(id(i), id(j + 1))) {
        continue;
      }
      yield [
        ...sequence.slice(0, i),
        ...sequence.slice(i, j + 1).reverse(),
        ...sequence.slice(j + 1),
      ];
    }
  }
}

/** Déplacer un arrêt libre vers n'importe quelle place d'une autre tournée, ou de la sienne. */
export function* relocations(plans: readonly VehiclePlan[], scope: MoveScope): Generator<Move> {
  const slots = slotsOf(plans);
  for (const source of slots) {
    for (let from = 0; from < source.stops.length; from += 1) {
      const stop = source.stops[from];
      if (stop === undefined || scope.pinned.has(stop.id)) {
        continue;
      }
      const without = [...source.stops.slice(0, from), ...source.stops.slice(from + 1)];
      for (const target of slots) {
        if (scope.crossOnly && target.vehicle === source.vehicle) {
          continue;
        }
        const base = target === source ? without : target.stops;
        for (let to = 0; to <= base.length; to += 1) {
          if ((target === source && to === from) || !closeTo(scope, stop, base, to)) {
            continue;
          }
          const withStop = [...base.slice(0, to), stop, ...base.slice(to)];
          yield target === source
            ? pairMove(plans, source, withStop, source, withStop)
            : pairMove(plans, source, without, target, withStop);
        }
      }
    }
  }
}

/** Poser `stop` au rang `to` de `stops` le rend-il voisin d'un proche ? */
function closeTo(
  scope: MoveScope,
  stop: RoutingStop,
  stops: readonly RoutingStop[],
  to: number,
): boolean {
  return (
    scope.near(stop.id, stops[to - 1]?.id ?? null) || scope.near(stop.id, stops[to]?.id ?? null)
  );
}

/** Échanger deux arrêts libres de deux tournées différentes. */
export function* swaps(plans: readonly VehiclePlan[], scope: MoveScope): Generator<Move> {
  const slots = slotsOf(plans);
  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      const a = slots[i];
      const b = slots[j];
      if (a !== undefined && b !== undefined && !(scope.crossOnly && a.vehicle === b.vehicle)) {
        yield* swapsBetween(plans, scope, a, b);
      }
    }
  }
}

function* swapsBetween(
  plans: readonly VehiclePlan[],
  scope: MoveScope,
  a: Slot,
  b: Slot,
): Generator<Move> {
  for (let p = 0; p < a.stops.length; p += 1) {
    for (let q = 0; q < b.stops.length; q += 1) {
      const s = a.stops[p];
      const t = b.stops[q];
      if (
        s === undefined ||
        t === undefined ||
        scope.pinned.has(s.id) ||
        scope.pinned.has(t.id) ||
        !scope.near(s.id, t.id)
      ) {
        continue;
      }
      const newA = a.stops.map((stop, index) => (index === p ? t : stop));
      const newB = b.stops.map((stop, index) => (index === q ? s : stop));
      yield pairMove(plans, a, newA, b, newB);
    }
  }
}

/** 2-opt* : échanger les fins de deux tournées sans épingle. */
export function* tailExchanges(plans: readonly VehiclePlan[], scope: MoveScope): Generator<Move> {
  const slots = slotsOf(plans).filter((slot) => !hasPinned(slot.stops, scope.pinned));
  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      const a = slots[i];
      const b = slots[j];
      if (a === undefined || b === undefined || (scope.crossOnly && a.vehicle === b.vehicle)) {
        continue;
      }
      for (let x = 0; x <= a.stops.length; x += 1) {
        for (let y = 0; y <= b.stops.length; y += 1) {
          const joins =
            scope.near(a.stops[x - 1]?.id ?? null, b.stops[y]?.id ?? null) ||
            scope.near(b.stops[y - 1]?.id ?? null, a.stops[x]?.id ?? null);
          if ((x === a.stops.length && y === b.stops.length) || !joins) {
            continue;
          }
          const newA = [...a.stops.slice(0, x), ...b.stops.slice(y)];
          const newB = [...b.stops.slice(0, y), ...a.stops.slice(x)];
          yield pairMove(plans, a, newA, b, newB);
        }
      }
    }
  }
}
