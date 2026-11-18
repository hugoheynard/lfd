import type { WriteTicket } from "../../../../../platform/journal/scoped-journal.js";
import type { AppellationAggregate, AppellationSnapshot } from "../entities/appellation.entity.js";

/** Une appellation telle qu'on la LIT, avec ce qui la retient. */
export interface AppellationRecord extends AppellationSnapshot {
  /** Combien d'ingrédients la citent — ils la gardent, même archivée. */
  readonly usedBy: number;
}

/** Le référentiel des **signes officiels** — lecture et écriture. */
export abstract class AppellationRepository {
  /** Toutes, hors service comprises, avec ce qui les retient. */
  abstract list(): Promise<readonly AppellationRecord[]>;
  abstract findByCode(code: string): Promise<AppellationAggregate | null>;
  abstract add(appellation: AppellationAggregate, ticket: WriteTicket): Promise<void>;
  abstract save(appellation: AppellationAggregate, ticket: WriteTicket): Promise<void>;
  /**
   * N'écrit QUE `archived_at` — pour l'archive et la restauration. Le geste
   * charge l'agrégat sous verrou, mais un renommage concurrent peut l'avoir
   * précédé : réécrire toute la ligne effacerait ce renommage.
   */
  abstract saveArchival(appellation: AppellationAggregate, ticket: WriteTicket): Promise<void>;
}
