import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { ContainerSample } from "../container-metrics-reader.port.js";
import { API_INSTANCE, containerUsageOf, type InstanceAllocation } from "../container-usage.js";

const GIB = 1024 ** 3;
const HALF_CORE: InstanceAllocation = { type: "standard-1", vcpu: 0.5, memoryBytes: 4 * GIB };

/** Une lecture à un instant arbitraire : seules les minutes RELATIVES comptent. */
const NOW = new Date(Date.parse("2030-01-01T12:00:30.000Z"));

function minutesAgo(minutes: number): string {
  const startOfMinute = Math.floor(NOW.getTime() / 60_000) * 60_000;
  return new Date(startOfMinute - minutes * 60_000).toISOString();
}

function sample(
  minutes: number,
  cpuTimeSec: number,
  memory: number,
  instanceId = "i-1",
): ContainerSample {
  return { minute: minutesAgo(minutes), instanceId, cpuTimeSec, maxMemoryBytes: memory };
}

describe("containerUsageOf", () => {
  it("rapporte le CPU consommé au CPU alloué : 15 s sur ½ vCPU × 60 s = 50 %", () => {
    const usage = containerUsageOf([sample(2, 15, GIB)], HALF_CORE, NOW, 5);

    expect(usage?.cpuPercent).toBe(50);
  });

  it("rapporte le PIC de mémoire à la mémoire allouée", () => {
    const usage = containerUsageOf([sample(3, 1, GIB), sample(2, 1, 2 * GIB)], HALF_CORE, NOW, 5);

    expect(usage?.memoryPercent).toBe(50);
  });

  it("ne rapporte qu'aux minutes REMONTÉES : un retard de Cloudflare ne se lit pas comme du calme", () => {
    // Deux minutes remontées sur cinq : 30 s de CPU sur 2 × 30 s allouées.
    const usage = containerUsageOf([sample(4, 15, GIB), sample(3, 15, GIB)], HALF_CORE, NOW, 5);

    expect(usage?.cpuPercent).toBe(50);
  });

  it("écarte la minute en cours, dont la consommation est partielle", () => {
    const usage = containerUsageOf([sample(1, 15, GIB), sample(0, 1, 3 * GIB)], HALF_CORE, NOW, 5);

    expect(usage?.cpuPercent).toBe(50);
    expect(usage?.memoryPercent).toBe(25);
  });

  it("date la mesure à la FIN de la dernière minute remontée — c'est d'elle que part le délai", () => {
    const usage = containerUsageOf([sample(4, 1, GIB), sample(2, 1, GIB)], HALF_CORE, NOW, 5);

    expect(usage?.measuredAt).toBe(minutesAgo(1));
  });

  it("compte les instances distinctes et rapporte le CPU par minute-instance", () => {
    const usage = containerUsageOf(
      [sample(2, 30, GIB, "i-1"), sample(2, 0, GIB, "i-2")],
      HALF_CORE,
      NOW,
      5,
    );

    expect(usage?.instances).toBe(2);
    expect(usage?.cpuPercent).toBe(50);
  });

  it("ne borne pas à 100 : une rafale au-delà de l'allocation est un fait", () => {
    expect(containerUsageOf([sample(2, 45, GIB)], HALF_CORE, NOW, 5)?.cpuPercent).toBe(150);
  });

  it("rend null sur une fenêtre vide — pas de 0 % qui ressemblerait à une mesure", () => {
    expect(containerUsageOf([], HALF_CORE, NOW, 5)).toBeNull();
    expect(containerUsageOf([sample(0, 10, GIB)], HALF_CORE, NOW, 5)).toBeNull();
  });

  it("porte le type d'instance et la fenêtre auxquels les pourcentages sont rapportés", () => {
    expect(containerUsageOf([sample(2, 1, GIB)], HALF_CORE, NOW, 5)).toMatchObject({
      instanceType: "standard-1",
      windowMinutes: 5,
    });
  });
});

describe("API_INSTANCE", () => {
  /**
   * Le container ne lit pas `wrangler.jsonc` : le type y est recopié. Grossir
   * l'instance sans toucher ce dénominateur ferait lire un CPU faux.
   */
  it("est le type d'instance déclaré dans wrangler.jsonc", () => {
    const wrangler = readFileSync(
      fileURLToPath(new URL("../../../../wrangler.jsonc", import.meta.url)),
      "utf8",
    );
    const declared = /"instance_type":\s*"([^"]+)"/.exec(wrangler)?.[1];

    expect(declared).toBe(API_INSTANCE.type);
  });
});
