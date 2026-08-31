import type { WriteTicket } from "../../../journal/pim-journal.js";
import type { AppellationAggregate, AppellationSnapshot } from "../entities/appellation.entity.js";

/** Une appellation telle qu'on la LIT, avec ce qui la retient. */
export interface AppellationRecord extends AppellationSnapshot {
  /** Combien d'ingrédients la citent. Zéro = elle est effaçable. */
  readonly usedBy: number;
}

/** Le référentiel des **signes officiels** — lecture et écriture. */
export abstract class AppellationRepository {
  /** Toutes, hors service comprises, avec ce qui les retient. */
  abstract list(): Promise<readonly AppellationRecord[]>;
  abstract findByCode(code: string): Promise<AppellationAggregate | null>;
  /** L'identifiant technique derrière un code — ce que l'ingrédient stocke. */
  abstract idOfCode(code: string): Promise<string | null>;
  abstract add(appellation: AppellationAggregate, ticket: WriteTicket): Promise<void>;
  abstract save(appellation: AppellationAggregate, ticket: WriteTicket): Promise<void>;
  /** Refuse (`AppellationInUseError`) si des ingrédients la citent encore. */
  abstract remove(code: string, ticket: WriteTicket): Promise<void>;
}
