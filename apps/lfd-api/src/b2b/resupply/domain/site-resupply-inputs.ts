import type { SiteResupplyLine } from "./site-resupply-line.js";
import type { ResupplyTarget, SiteResupplyTrace } from "./site-resupply-snapshot.js";

/** La demande en cours d'un point, ouverte au geste `at` (`SiteResupply.draft`). */
export interface CounterDraftInput {
  readonly id: string;
  readonly siteId: string;
  readonly target: ResupplyTarget;
  readonly at: Date;
}

/** Le réassort que le fournil crée et envoie d'un geste (`SiteResupply.sentByBakehouse`). */
export interface BakehouseResupplyInput {
  readonly id: string;
  readonly siteId: string;
  readonly target: ResupplyTarget;
  readonly name: string | null;
  readonly lines: readonly SiteResupplyLine[];
  readonly trace: SiteResupplyTrace;
  readonly deadline: Date | null;
  readonly planStopped: boolean;
}

/** Une sortie de la réserve du colisage vers une boutique (`SiteResupply.sentFromReserve`). */
export interface ReserveResupplyInput {
  readonly id: string;
  readonly siteId: string;
  readonly reserveDay: string;
  readonly lines: readonly SiteResupplyLine[];
  readonly trace: SiteResupplyTrace;
}
