import { insertIntoRounds } from "../insert-into-rounds.js";
import type { Proposal } from "../proposal.js";
import { proposeRounds } from "../propose-rounds.js";
import { benchDay, INSERTED_COUNT } from "./composition-bench-day.js";

/**
 * Le banc à 200 clients (composition-automatique.md §5 point 3) : le calcul
 * PUR de « Proposer » et d'« Insérer », matrice calculée d'avance. Vingt
 * tirages, graines 1..20 ; on rend la médiane et le p95 du temps processeur.
 * Seuil retenu le 2026-10-06 : p95 < 5 s, dans le conteneur.
 *
 * Un SCRIPT lancé par `tsx` (`pnpm --filter lfd-api bench:composition`), pas
 * une suite Jest : la CI n'est pas une machine de mesure, et le bac à sable de
 * Jest (modules ESM en VM) rendait le même calcul environ cinq fois plus lent
 * que Node nu — 34,6 s contre 7,0 s pour la graine 9, mesuré le 2026-10-06.
 * Le conteneur exécute du Node nu ; c'est lui qu'on imite.
 */
const STOP_COUNT = 200;
const DRAWS = 20;
const P95 = 0.95;
const MICROSECONDS_PER_MS = 1000;
const THRESHOLD_MS = 5000;

interface Measure {
  readonly completeMs: number;
  readonly insertMs: number;
  readonly composed: Proposal;
  readonly inserted: Proposal;
}

function cpuMilliseconds<T>(run: () => T): readonly [T, number] {
  const before = process.cpuUsage();
  const result = run();
  const spent = process.cpuUsage(before);
  return [result, (spent.user + spent.system) / MICROSECONDS_PER_MS];
}

function measure(seed: number): Measure {
  const day = benchDay(seed, STOP_COUNT);
  const [composed, completeMs] = cpuMilliseconds(() => proposeRounds(day.complete));
  const input = day.insertion(composed);
  const [inserted, insertMs] = cpuMilliseconds(() => insertIntoRounds(input));
  return { completeMs, insertMs, composed, inserted };
}

/** Le rang le plus proche (nearest-rank) : sur 20 tirages, le p95 est le 19ᵉ. */
function quantile(values: readonly number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)] ?? 0;
}

const ms = (value: number): string => `${value.toFixed(0).padStart(6)} ms`;

function report(measures: readonly Measure[]): string {
  const complete = measures.map((m) => m.completeMs);
  const insert = measures.map((m) => m.insertMs);
  const rows = measures.map(
    (m, index) =>
      `  graine ${String(index + 1).padStart(2)} | complet ${ms(m.completeMs)} | insérer ${ms(m.insertMs)}` +
      ` | tournées ${String(m.composed.tours.length).padStart(2)}` +
      ` | à répartir ${String(m.composed.overflow.length + m.composed.capacityRefused.length).padStart(3)}` +
      ` | insérés non placés ${String(m.inserted.overflow.length + m.inserted.capacityRefused.length)}/${String(INSERTED_COUNT)}`,
  );
  return [
    `Banc « Proposer » — ${String(STOP_COUNT)} arrêts, 4 véhicules, 2 passages, ${String(DRAWS)} tirages (temps processeur)`,
    ...rows,
    `  complet : médiane ${ms(quantile(complete, 0.5))} · p95 ${ms(quantile(complete, P95))} · max ${ms(Math.max(...complete))}`,
    `  insérer : médiane ${ms(quantile(insert, 0.5))} · p95 ${ms(quantile(insert, P95))} · max ${ms(Math.max(...insert))}`,
    `  seuil p95 < ${String(THRESHOLD_MS)} ms`,
  ].join("\n");
}

measure(0); // échauffement du JIT, hors mesure
const measures = Array.from({ length: DRAWS }, (_, index) => measure(index + 1));
process.stdout.write(`\n${report(measures)}\n`);
