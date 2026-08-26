import type { WriteTicket } from "../../../journal/pim-journal.js";
import type { SalesContextAggregate } from "../entities/sales-context.entity.js";

/** Ce qui retient un contexte, et l'empêche d'être effacé. */
export interface SalesContextUsage {
  /** Familles et fiches qui le vendent — la matrice de canaux. */
  readonly soldBy: number;
  /** Points de vente qui l'offrent. */
  readonly offeredBy: number;
  /** Taux réglés dessus, famille ou fiche. */
  readonly ratedBy: number;
}

/**
 * L'**écriture** du registre des contextes de vente.
 *
 * Séparé de `SalesContextRegistry`, qui lit : les canaux et les projections
 * itèrent le registre à chaque geste de catalogue, et n'ont aucune raison de
 * voir passer un `remove`. Ce port-ci ne sert qu'à la surface d'administration,
 * qui est murée derrière `catalog:write` — le seul droit que porte l'admin.
 */
export abstract class SalesContextRepository {
  abstract findByKey(key: string): Promise<SalesContextAggregate | null>;
  /** Le contexte qui porte ce suffixe de handle **et** est projeté, s'il existe. */
  abstract findProjectedByHandleSuffix(suffix: string): Promise<SalesContextAggregate | null>;
  /** Le rang libre en fin de registre — un contexte neuf se pose après les autres. */
  abstract nextPosition(): Promise<number>;
  abstract add(context: SalesContextAggregate, ticket: WriteTicket): Promise<void>;
  abstract save(context: SalesContextAggregate, ticket: WriteTicket): Promise<void>;
  /** Refuse (`SalesContextInUseError`) si quelque chose le retient encore. */
  abstract remove(key: string, ticket: WriteTicket): Promise<void>;
  /**
   * Ce qui retient chaque contexte, pour toute la liste en une lecture.
   *
   * Sert l'ÉCRAN, pas un invariant : il doit pouvoir dire ce qu'une
   * désactivation emporterait avant le geste, plutôt que de laisser le refus
   * l'apprendre après. Les contextes que rien ne retient en sont absents.
   */
  abstract usageByKey(): Promise<ReadonlyMap<string, SalesContextUsage>>;
}
