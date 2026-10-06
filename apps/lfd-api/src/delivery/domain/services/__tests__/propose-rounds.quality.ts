import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { insertIntoRounds } from "../insert-into-rounds.js";
import type { Proposal } from "../proposal.js";
import { proposeRounds, startOf } from "../propose-rounds.js";
import { isBetterScore, scoreVehicle, type VehicleScore } from "../vehicle-plan.js";
import { benchDay } from "./composition-bench-day.js";

/**
 * La QUALITÉ des propositions du banc (composition-automatique.md §5) : pour
 * chaque graine, le score de la proposition complète et de l'insertion, et
 * une empreinte de leur contenu. Comparé à la référence enregistrée
 * (`composition-bench-baseline.json`) : une optimisation du calcul doit
 * rendre la MÊME proposition, ou une meilleure-ou-égale au score.
 *
 * `--record` réécrit la référence — à ne faire que sur un calcul dont on a
 * accepté le résultat.
 */
const STOP_COUNT = 200;
const DRAWS = 20;
const BASELINE = new URL("./composition-bench-baseline.json", import.meta.url);

interface Quality {
  readonly late: number;
  readonly cost: number;
  readonly unplaced: number;
  readonly print: string;
}

interface SeedQuality {
  readonly complete: Quality;
  readonly insert: Quality;
}

/** Le score d'une proposition : chaque véhicule noté sur ses tournées, dans l'ordre des passages. */
function qualityOf(ctx: Parameters<typeof startOf>[0], proposal: Proposal): Quality {
  const vehicles = [...new Set(proposal.tours.map((tour) => tour.vehicleId))].sort();
  const total: VehicleScore = vehicles.reduce(
    (sum, vehicleId) => {
      const routes = proposal.tours
        .filter((tour) => tour.vehicleId === vehicleId)
        .sort((a, b) => a.rank - b.rank)
        .map((tour) => ({ roundId: tour.roundId, stops: tour.stops }));
      const score = scoreVehicle(ctx, routes, startOf(ctx, vehicleId));
      return { lateSeconds: sum.lateSeconds + score.lateSeconds, cost: sum.cost + score.cost };
    },
    { lateSeconds: 0, cost: 0 },
  );
  const content = JSON.stringify([
    proposal.tours.map((tour) => [tour.vehicleId, tour.rank, tour.stops.map((stop) => stop.id)]),
    proposal.overflow,
    proposal.capacityRefused,
  ]);
  return {
    late: total.lateSeconds,
    cost: Math.round(total.cost),
    unplaced: proposal.overflow.length + proposal.capacityRefused.length,
    print: createHash("sha256").update(content).digest("hex").slice(0, 12),
  };
}

function measure(seed: number): SeedQuality {
  const day = benchDay(seed, STOP_COUNT);
  const composed = proposeRounds(day.complete);
  const input = day.insertion(composed);
  return {
    complete: qualityOf(day.complete, composed),
    insert: qualityOf({ ...input, starts: new Map() }, insertIntoRounds(input)),
  };
}

/** `identique`, `meilleur`, ou `PIRE` — moins de non-placés d'abord, puis le score. */
function verdict(now: Quality, then: Quality): string {
  if (now.print === then.print) return "identique";
  if (now.unplaced !== then.unplaced) return now.unplaced < then.unplaced ? "meilleur" : "PIRE";
  const a = { lateSeconds: now.late, cost: now.cost };
  const b = { lateSeconds: then.late, cost: then.cost };
  if (isBetterScore(a, b)) return "meilleur";
  return isBetterScore(b, a) ? "PIRE" : "égal (autre)";
}

const show = (q: Quality): string =>
  `retard ${String(q.late).padStart(5)} s · coût ${String(q.cost).padStart(7)} · non placés ${String(q.unplaced).padStart(2)}`;

const results = Array.from({ length: DRAWS }, (_, index) => measure(index + 1));
if (process.argv.includes("--record")) {
  writeFileSync(BASELINE, `${JSON.stringify(results, null, 2)}\n`);
  process.stdout.write(`Référence enregistrée : ${String(DRAWS)} graines.\n`);
} else {
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as readonly SeedQuality[];
  let worse = 0;
  const lines = results.flatMap((now, index) => {
    const then = baseline[index];
    if (then === undefined) return [];
    return (["complete", "insert"] as const).map((mode) => {
      const said = verdict(now[mode], then[mode]);
      worse += said === "PIRE" ? 1 : 0;
      return `  graine ${String(index + 1).padStart(2)} ${mode === "complete" ? "complet" : "insérer"} | avant ${show(then[mode])} | après ${show(now[mode])} | ${said}`;
    });
  });
  process.stdout.write(`\nQualité du banc, contre la référence\n${lines.join("\n")}\n`);
  process.exitCode = worse > 0 ? 1 : 0;
}
