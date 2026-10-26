/**
 * Un `drain()` qui ne converge pas devient une erreur NOMMÉE, pas un hook muet.
 *
 * Le 2026-10-26, trois suites lourdes se sont figées en CI quatre minutes dans
 * leur `beforeAll`/`beforeEach`, puis Jest a dit « Exceeded timeout » — rien
 * d'autre. La cause était une tâche de fond (`on-company-declared-resolve-naf`)
 * pendue sur un appel réseau sans délai ; `whenIdle()` l'attendait, sans que
 * personne puisse le savoir.
 *
 * Ce n'est PAS un délai qui masque : l'attente échoue quand plus rien
 * n'avance, et l'erreur dit ce qui reste — les tâches en vol par leur
 * étiquette, et les livraisons de la boîte d'envoi non livrées (fait, clé,
 * abonné, essais, dernière erreur).
 */
import type { BackgroundWork } from "../src/platform/events/background-work.js";
import type { PrismaService } from "../src/platform/database/prisma.service.js";

/**
 * Sans AUCUNE tâche terminée pendant ce temps, l'attente est figée. Sous les
 * 30 s du délai par défaut d'un hook Jest, pour que l'erreur nommée arrive
 * avant le « Exceeded timeout » qui ne dit rien.
 */
const STALL_MS = 20_000;
/** Au-delà, même une file qui avance est une boucle : on la nomme aussi. */
const TOTAL_MS = 180_000;
/** Fréquence à laquelle on regarde si l'attente avance. */
const POLL_MS = 250;
/** Livraisons montrées au plus : un témoin, pas un vidage. */
const SHOWN_DELIVERIES = 20;

/** Une livraison de la boîte d'envoi encore due, telle que l'erreur la montre. */
export interface PendingDelivery {
  readonly type: string;
  readonly key: string;
  readonly subscriber: string;
  readonly attempts: number;
  readonly lastError: string | null;
}

/** L'attente du travail de fond n'a pas convergé — et voici ce qui reste. */
export class DrainDidNotConvergeError extends Error {
  constructor(
    readonly step: string,
    readonly reason: "figée" | "trop longue",
    readonly waitedMs: number,
    readonly inFlight: readonly string[],
    readonly outbox: readonly PendingDelivery[],
  ) {
    super(
      `${step} : le travail de fond n'a pas convergé (${reason}, ${String(Math.round(waitedMs / 1000))} s).\n` +
        `En vol (${String(inFlight.length)}) : ${describeInFlight(inFlight)}\n` +
        `Boîte d'envoi non livrée (${String(outbox.length)}) :\n${describeOutbox(outbox)}`,
    );
    this.name = "DrainDidNotConvergeError";
  }
}

function describeInFlight(labels: readonly string[]): string {
  if (labels.length === 0) {
    return "rien";
  }
  const counts = new Map<string, number>();
  for (const label of labels) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([label, count]) => `${label} ×${String(count)}`).join(", ");
}

function describeOutbox(deliveries: readonly PendingDelivery[]): string {
  if (deliveries.length === 0) {
    return "  rien";
  }
  return deliveries
    .map(
      (d) =>
        `  · ${d.type} [${d.key}] → ${d.subscriber}, ${String(d.attempts)} essai(s)` +
        (d.lastError === null ? "" : ` — dernière erreur : ${d.lastError}`),
    )
    .join("\n");
}

/** Les livraisons encore dues. N'échoue jamais : elle accompagne une erreur. */
async function pendingDeliveries(prisma: PrismaService): Promise<readonly PendingDelivery[]> {
  try {
    const rows = await prisma.outboxDelivery.findMany({
      where: { deliveredAt: null },
      include: { message: { select: { type: true, key: true } } },
      orderBy: { nextAttemptAt: "asc" },
      take: SHOWN_DELIVERIES,
    });
    return rows.map((row) => ({
      type: row.message.type,
      key: row.message.key,
      subscriber: row.subscriber,
      attempts: row.attempts,
      lastError: row.lastError,
    }));
  } catch {
    return [];
  }
}

export interface DrainLimits {
  readonly stallMs: number;
  readonly totalMs: number;
  readonly pollMs: number;
}

const DEFAULT_LIMITS: DrainLimits = { stallMs: STALL_MS, totalMs: TOTAL_MS, pollMs: POLL_MS };

function tick(ms: number): Promise<"tick"> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve("tick");
    }, ms);
  });
}

/**
 * `whenIdle()`, sous surveillance : rend la main quand tout est fini, ou lève
 * {@link DrainDidNotConvergeError} quand plus rien ne se termine pendant
 * `stallMs`, ou que l'attente dépasse `totalMs`.
 */
export async function drainOrExplain(
  work: BackgroundWork,
  prisma: PrismaService,
  step: string,
  limits: DrainLimits = DEFAULT_LIMITS,
): Promise<void> {
  const idle = work.whenIdle().then(() => "idle" as const);
  const started = performance.now();
  let lastSettled = work.snapshot().settled;
  let lastProgress = started;
  for (;;) {
    if ((await Promise.race([idle, tick(limits.pollMs)])) === "idle") {
      return;
    }
    const now = performance.now();
    const snapshot = work.snapshot();
    if (snapshot.settled !== lastSettled) {
      lastSettled = snapshot.settled;
      lastProgress = now;
    }
    const stalled = now - lastProgress >= limits.stallMs;
    if (stalled || now - started >= limits.totalMs) {
      throw new DrainDidNotConvergeError(
        step,
        stalled ? "figée" : "trop longue",
        now - started,
        snapshot.pending,
        await pendingDeliveries(prisma),
      );
    }
  }
}
