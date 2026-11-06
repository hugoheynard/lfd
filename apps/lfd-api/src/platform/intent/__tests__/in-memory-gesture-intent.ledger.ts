import type { Clock } from "../../time/clock.js";
import { FixedClock } from "../../time/fixed-clock.js";
import { OncePerIntent } from "../once-per-intent.js";
import {
  GESTURE_INTENT_LEASE_MS,
  type GestureIntent,
  GestureIntentLedger,
  type IntentClaim,
  type IntentRecord,
} from "../gesture-intent.js";

interface Held {
  readonly gesture: string;
  readonly subject: string;
  claimedAt: Date;
  result: IntentRecord | null;
}

/**
 * Le registre des intentions EN MÉMOIRE, pour les tests d'application : il
 * tient les mêmes quatre issues que l'adaptateur Prisma, sans la base.
 * Partagé : tout test d'un geste du staff qui envoie un e-mail l'importe.
 */
export class InMemoryGestureIntentLedger extends GestureIntentLedger {
  private readonly held = new Map<string, Held>();

  claim(intent: GestureIntent, now: Date): Promise<IntentClaim> {
    const id = `${intent.actorId}|${intent.key}`;
    const held = this.held.get(id);
    if (held === undefined) {
      this.held.set(id, {
        gesture: intent.gesture,
        subject: intent.subject,
        claimedAt: now,
        result: null,
      });
      return Promise.resolve({ kind: "claimed" });
    }
    if (held.gesture !== intent.gesture || held.subject !== intent.subject) {
      return Promise.resolve({ kind: "mismatch" });
    }
    if (held.result !== null) {
      return Promise.resolve({ kind: "replayed", result: held.result });
    }
    if (now.getTime() - held.claimedAt.getTime() < GESTURE_INTENT_LEASE_MS) {
      return Promise.resolve({ kind: "in_flight" });
    }
    held.claimedAt = now;
    return Promise.resolve({ kind: "claimed" });
  }

  resolve(intent: GestureIntent, result: IntentRecord): Promise<void> {
    const held = this.held.get(`${intent.actorId}|${intent.key}`);
    if (held !== undefined && held.result === null) {
      held.result = result;
    }
    return Promise.resolve();
  }

  release(intent: GestureIntent): Promise<void> {
    const id = `${intent.actorId}|${intent.key}`;
    if (this.held.get(id)?.result === null) {
      this.held.delete(id);
    }
    return Promise.resolve();
  }
}

/**
 * La garde réelle (`OncePerIntent`) sur le registre en mémoire : ce que les
 * tests d'un geste injectent. L'horloge n'est comparée qu'à elle-même (bail).
 */
export function inMemoryIntents(
  ledger: GestureIntentLedger = new InMemoryGestureIntentLedger(),
  clock: Clock = new FixedClock(new Date(0)),
): OncePerIntent {
  return new OncePerIntent(ledger, clock);
}
