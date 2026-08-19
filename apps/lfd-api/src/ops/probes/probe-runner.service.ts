import { Inject, Injectable } from "@nestjs/common";

import { NODE_PROBES, NodeProbe, type ProbeOutcome } from "./probe.port.js";

/**
 * Combien d'échecs D'AFFILÉE avant de déclarer un nœud tombé.
 *
 * Deux, et pas un : un timeout isolé arrive — une résolution DNS lente, un
 * redéploiement chez le tiers, une seconde de réseau. Crier au loup sur le
 * premier apprend à ignorer la carte, et c'est irréversible : personne ne
 * redonne sa confiance à un écran qui l'a perdue.
 */
export const FAILURES_BEFORE_DOWN = 2;

/**
 * Lance toutes les sondes et retient leur verdict.
 *
 * Le compteur d'échecs consécutifs vit **en mémoire du processus**. C'est assumé
 * pour l'instant : un redémarrage remet les compteurs à zéro, donc au pire on
 * met un cycle de plus à confirmer une panne — jamais l'inverse. Le jour où OPS
 * tournera sur plusieurs instances, ce compteur ira dans Redis, comme le reste
 * de l'état vivant.
 */
@Injectable()
export class ProbeRunner {
  private readonly failures = new Map<string, number>();

  constructor(@Inject(NODE_PROBES) private readonly probes: readonly NodeProbe[]) {}

  /** Tous les verdicts, par identifiant de nœud. Rien ne jette, rien n'attend. */
  async run(): Promise<ReadonlyMap<string, ProbeOutcome>> {
    const results = await Promise.all(
      this.probes.map(async (probe) => {
        const outcome = await probe.check().catch((): ProbeOutcome => ({
          verdict: "down",
          latencyMs: 0,
          detail: "la sonde elle-même a échoué",
        }));
        return [probe.id, this.confirm(probe.id, outcome)] as const;
      }),
    );
    return new Map(results);
  }

  /**
   * Applique la règle des échecs consécutifs. Un `down` isolé est rendu comme
   * **`unknown`** — « on ne sait pas encore » — et non comme un `up` : masquer
   * un premier échec en vert serait mentir dans l'autre sens.
   */
  private confirm(id: string, outcome: ProbeOutcome): ProbeOutcome {
    if (outcome.verdict !== "down") {
      this.failures.delete(id);
      return outcome;
    }
    const streak = (this.failures.get(id) ?? 0) + 1;
    this.failures.set(id, streak);
    if (streak >= FAILURES_BEFORE_DOWN) {
      return outcome;
    }
    return {
      verdict: "unknown",
      latencyMs: outcome.latencyMs,
      detail: `${outcome.detail ?? "échec"} — ${streak}/${FAILURES_BEFORE_DOWN}, en attente de confirmation`,
    };
  }
}
