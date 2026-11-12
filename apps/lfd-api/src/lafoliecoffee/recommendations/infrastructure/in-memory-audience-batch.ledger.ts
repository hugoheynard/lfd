import { Injectable } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import { AudienceBatchLedger } from "../domain/ports/audience-batch.ledger.js";

/** Un réseau rejoue une requête dans les secondes qui suivent, pas des heures après. */
const REMEMBER_MS = 10 * 60 * 1_000;
/** Borne de mémoire : au-delà, les plus anciens sont oubliés d'abord. */
const MAX_REMEMBERED = 20_000;

/**
 * Le registre des lots, en mémoire du processus : aucune écriture en base pour
 * une mesure d'audience (une instance aujourd'hui, `max_instances: 1`, vérifié
 * dans `wrangler.jsonc` le 2026-11-12). Réserver puis compter est synchrone
 * côté réservation : deux copies simultanées d'un lot ne passent pas toutes les deux.
 */
@Injectable()
export class InMemoryAudienceBatchLedger extends AudienceBatchLedger {
  private readonly seen = new Map<string, number>();

  constructor(private readonly clock: Clock) {
    super();
  }

  claim(batchId: string): boolean {
    const now = this.clock.now().getTime();
    this.forgetOlderThan(now - REMEMBER_MS);
    if (this.seen.has(batchId)) {
      return false;
    }
    this.seen.set(batchId, now);
    if (this.seen.size > MAX_REMEMBERED) {
      const oldest = this.seen.keys().next();
      if (oldest.done !== true) {
        this.seen.delete(oldest.value);
      }
    }
    return true;
  }

  release(batchId: string): void {
    this.seen.delete(batchId);
  }

  /** Les entrées sont rangées par ordre d'arrivée : on s'arrête à la première récente. */
  private forgetOlderThan(limit: number): void {
    for (const [batchId, at] of this.seen) {
      if (at >= limit) {
        return;
      }
      this.seen.delete(batchId);
    }
  }
}
