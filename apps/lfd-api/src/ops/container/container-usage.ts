import type { ContainerUsage } from "@lfd/ops-contract";

import type { ContainerSample } from "./container-metrics-reader.port.js";

/**
 * **Le CPU et la mémoire du container, rapportés à ce qu'on paie** — pur, donc
 * testé sans réseau.
 */

/** Ce qu'un type d'instance alloue. */
export interface InstanceAllocation {
  readonly type: string;
  readonly vcpu: number;
  readonly memoryBytes: number;
}

const GIB = 1024 ** 3;

/**
 * Le type d'instance de l'API, **recopié** de `apps/lfd-api/wrangler.jsonc`
 * (`containers[0].instance_type`) — le container ne lit pas ce fichier, et un
 * test le relit pour que les deux ne divergent pas en silence.
 *
 * `standard-1` = ½ vCPU, 4 GiB de mémoire : table « Instance types » de
 * https://developers.cloudflare.com/containers/platform/limits/ (relue le
 * 2026-10-19). Grossir l'instance change ce dénominateur : sans lui, un passage
 * en `standard-2` ferait lire un CPU deux fois trop haut.
 */
export const API_INSTANCE: InstanceAllocation = {
  type: "standard-1",
  vcpu: 0.5,
  memoryBytes: 4 * GIB,
};

/** La largeur d'un échantillon : Cloudflare est lu par minute. */
const SAMPLE_SECONDS = 60;

/**
 * L'usage sur la fenêtre, ou `null` si Cloudflare n'a rien remonté.
 *
 * - **CPU** = secondes CPU consommées ÷ secondes CPU allouées, sur les seules
 *   minutes-instance remontées. Rapporter au temps de la fenêtre entière
 *   ferait baisser le chiffre d'autant que Cloudflare est en retard — le délai
 *   de remontée se lirait comme un container au repos.
 * - **Mémoire** = le pic de la fenêtre ÷ la mémoire allouée : c'est le pic qui
 *   tue un process, pas la moyenne.
 *
 * La minute **en cours** (non terminée à `now`) est écartée : sa consommation
 * est partielle, et elle tirerait le CPU vers le bas à chaque lecture.
 *
 * Rien n'est borné à 100 : un dépassement est un fait (rafale au-delà de
 * l'allocation), et le cacher serait inventer.
 */
export function containerUsageOf(
  samples: readonly ContainerSample[],
  allocation: InstanceAllocation,
  now: Date,
  windowMinutes: number,
): ContainerUsage | null {
  const complete = samples.filter(
    (sample) => Date.parse(sample.minute) + SAMPLE_SECONDS * 1000 <= now.getTime(),
  );
  if (complete.length === 0) {
    return null;
  }
  const cpuSeconds = complete.reduce((sum, sample) => sum + sample.cpuTimeSec, 0);
  const allocatedCpuSeconds = complete.length * SAMPLE_SECONDS * allocation.vcpu;
  const peakMemory = Math.max(...complete.map((sample) => sample.maxMemoryBytes));
  const lastMinute = Math.max(...complete.map((sample) => Date.parse(sample.minute)));
  return {
    cpuPercent: percent(cpuSeconds / allocatedCpuSeconds),
    memoryPercent: percent(peakMemory / allocation.memoryBytes),
    measuredAt: new Date(lastMinute + SAMPLE_SECONDS * 1000).toISOString(),
    instances: new Set(complete.map((sample) => sample.instanceId)).size,
    instanceType: allocation.type,
    windowMinutes,
  };
}

/** Un ratio en pourcentage, à une décimale : au-delà, c'est du bruit. */
function percent(ratio: number): number {
  return Math.round(ratio * 1000) / 10;
}
