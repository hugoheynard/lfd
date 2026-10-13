/**
 * Chronométrage du démarrage et de l'arrêt de l'application e2e, PAR FICHIER.
 *
 * Mesure posée le 2026-10-13 : chaque fichier e2e boote son `AppModule` entier
 * puis le ferme. La question est de savoir ce que ça coûte avant de décider de
 * partager une application entre fichiers. Une ligne JSON par fichier, dans le
 * chemin que donne `E2E_BOOT_LOG` ; sans la variable, rien n'est écrit.
 */
import { appendFileSync } from "node:fs";
import { relative } from "node:path";
import { performance } from "node:perf_hooks";
import { E2E_BOOT_LOG } from "./setup-env.js";

/** Les phases d'un démarrage, en millisecondes. */
export type BootPhase = "compile" | "init" | "dbReady" | "listen";

/** Un chronomètre de démarrage, refermé à l'arrêt de l'application. */
export class BootStopwatch {
  private readonly startedAt = performance.now();
  private lastMark = this.startedAt;
  private readonly phases: Partial<Record<BootPhase, number>> = {};
  private bootMs = 0;
  private resetMs = 0;
  private resetCount = 0;

  /** Clôt la phase en cours (du repère précédent jusqu'à maintenant). */
  mark(phase: BootPhase): void {
    const now = performance.now();
    this.phases[phase] = round(now - this.lastMark);
    this.lastMark = now;
  }

  /** L'application est prête : le démarrage s'arrête là. */
  ready(): void {
    this.bootMs = round(performance.now() - this.startedAt);
  }

  /** Chronomètre une remise à zéro de la base (une par cas, en général). */
  async timeReset(reset: () => Promise<void>): Promise<void> {
    const start = performance.now();
    await reset();
    this.resetMs += performance.now() - start;
    this.resetCount += 1;
  }

  /** Chronomètre l'arrêt, puis écrit la ligne du fichier. */
  async timeClose(close: () => Promise<void>): Promise<void> {
    const start = performance.now();
    await close();
    const closeMs = round(performance.now() - start);
    if (E2E_BOOT_LOG === undefined || E2E_BOOT_LOG === "") return;
    const testPath = expect.getState().testPath ?? "inconnu";
    const line = {
      file: relative(process.cwd(), testPath),
      bootMs: this.bootMs,
      closeMs,
      phases: this.phases,
      resetMs: round(this.resetMs),
      resetCount: this.resetCount,
    };
    appendFileSync(E2E_BOOT_LOG, `${JSON.stringify(line)}\n`);
  }
}

function round(ms: number): number {
  return Math.round(ms);
}
