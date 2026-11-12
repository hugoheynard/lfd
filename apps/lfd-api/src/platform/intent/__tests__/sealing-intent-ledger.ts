import { UnitOfWork } from "../../database/unit-of-work.js";
import type { GestureIntent, IntentRecord } from "../gesture-intent.js";
import { InMemoryGestureIntentLedger } from "./in-memory-gesture-intent.ledger.js";

/**
 * Le registre en mémoire, pour éprouver `OncePerIntent.runSealed` : il note si
 * chaque résolution a eu lieu DANS l'unité de travail du geste (le prédicat
 * vient du double d'unité de travail du test), et peut refuser de sceller.
 *
 * Un refus de sceller lève dans la transaction : sous Postgres, l'écriture du
 * geste est annulée avec elle. Les doubles en mémoire ne jouent pas
 * l'annulation ; un test prouve donc la résolution « in tx », et la base fait
 * le reste.
 */
export class SealingIntentLedger extends InMemoryGestureIntentLedger {
  readonly resolutions: ("in tx" | "OUTSIDE tx")[] = [];
  /** Le prochain scellement échoue avec cette erreur, puis le registre redevient sain. */
  refuseNextSeal: Error | null = null;

  constructor(private readonly insideTransaction: () => boolean) {
    super();
  }

  override resolve(intent: GestureIntent, result: IntentRecord): Promise<boolean> {
    this.resolutions.push(this.insideTransaction() ? "in tx" : "OUTSIDE tx");
    const refusal = this.refuseNextSeal;
    if (refusal !== null) {
      this.refuseNextSeal = null;
      return Promise.reject(refusal);
    }
    return super.resolve(intent, result);
  }
}

/**
 * Une unité de travail qui dit si l'on est dedans. Ouverte, elle REJOINT
 * l'unité en cours, comme l'adaptateur Prisma.
 */
export class InsideUnitOfWork extends UnitOfWork {
  private depth = 0;

  get inside(): boolean {
    return this.depth > 0;
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    this.depth += 1;
    try {
      return await work();
    } finally {
      this.depth -= 1;
    }
  }
}
