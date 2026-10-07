import type { CapacityGuard } from "./capacity-guard.js";
import { improvePlans } from "./improve-plans.js";
import { insertCheapest } from "./insert-cheapest.js";
import type { PlannableStop, ProposalInput } from "./propose-rounds.js";
import { sectorRuleOf, sectorsOf } from "./sectors.js";
import {
  isBetterScore,
  scoreVehicle,
  type VehiclePlan,
  type VehicleScore,
} from "./vehicle-plan.js";
import type { ZoneRule } from "./zone-rule.js";

/**
 * Une composition achevée : ce que l'insertion a laissé (`built.unplaced`) et
 * les plans améliorés. Sortie de `propose-rounds.ts` avec le choix entre les
 * deux départs, qui ne regarde qu'elle.
 */
export interface Composition {
  readonly built: ReturnType<typeof insertCheapest>;
  readonly plans: readonly VehiclePlan[];
}

/**
 * **Deux départs, le meilleur gardé** (Hugo, 2026-10-07 : « une camionnette
 * peut faire des tours dans un plus faible rayon »). L'amélioration pas à pas
 * ne quitte pas la répartition de départ : partie de l'insertion seule, elle
 * mêle loin et près dans chaque camionnette. Partie de SECTEURS
 * (`sectorsOf`), elle rend des tournées plus serrées et moins chères sur le
 * banc (coût −11 %, 2026-10-07).
 *
 * Les secteurs seuls ne suffisent pas : un secteur par véhicule ouvre deux
 * tournées là où une seule suffit (journée enregistrée, 434 min contre 388),
 * et un Kangoo plein dans son coin laisse une commande à répartir. On compose
 * donc les deux, et l'on garde le moins de commandes à répartir, puis le
 * moins de retard, puis le moindre coût : jamais pire qu'avant. Le prix est
 * le temps — deux compositions au lieu d'une (`todo-calculateur.md`).
 */
export function bestComposition(
  input: ProposalInput,
  initial: readonly VehiclePlan[],
  stops: readonly PlannableStop[],
  guard: CapacityGuard,
  zones: ZoneRule,
): Composition {
  const plain = compose(input, initial, stops, guard, zones, zones);
  const sectors = sectorsOf(
    input,
    stops,
    initial.map((plan) => ({ id: plan.vehicle.id, passages: plan.maxRoutes })),
    input.capacity,
  );
  if (sectors.size === 0) {
    return plain;
  }
  const sectored = compose(input, initial, stops, guard, sectorRuleOf(sectors, zones), zones);
  return isBetterComposition(input, sectored, plain) ? sectored : plain;
}

/** Placer d'abord sous `seed`, puis ce qui reste sous `zones`, puis améliorer sous `zones`. */
function compose(
  input: ProposalInput,
  initial: readonly VehiclePlan[],
  stops: readonly PlannableStop[],
  guard: CapacityGuard,
  seed: ZoneRule,
  zones: ZoneRule,
): Composition {
  const first = insertCheapest(input, initial, stops, "anywhere", guard, seed);
  const built =
    seed === zones || first.unplaced.length === 0
      ? first
      : insertCheapest(
          input,
          first.plans,
          first.unplaced.map(({ stop }) => stop),
          "anywhere",
          guard,
          zones,
        );
  return { built, plans: improvePlans(input, built.plans, new Set(), guard, zones) };
}

function isBetterComposition(input: ProposalInput, a: Composition, b: Composition): boolean {
  if (a.built.unplaced.length !== b.built.unplaced.length) {
    return a.built.unplaced.length < b.built.unplaced.length;
  }
  return isBetterScore(totalScoreOf(input, a.plans), totalScoreOf(input, b.plans));
}

function totalScoreOf(input: ProposalInput, plans: readonly VehiclePlan[]): VehicleScore {
  return plans.reduce(
    (sum, plan) => {
      const score = scoreVehicle(input, plan.routes, plan);
      return { lateSeconds: sum.lateSeconds + score.lateSeconds, cost: sum.cost + score.cost };
    },
    { lateSeconds: 0, cost: 0 },
  );
}
