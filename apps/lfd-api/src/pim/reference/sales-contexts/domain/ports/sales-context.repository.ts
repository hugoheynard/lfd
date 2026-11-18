import type { WriteTicket } from "../../../../../platform/journal/scoped-journal.js";
import type { SalesContextAggregate } from "../entities/sales-context.entity.js";

/** Ce qui retient un contexte, et l'empêche d'être archivé. */
export interface SalesContextUsage {
  /** Taux réglés dessus, famille ou fiche. */
  readonly ratedBy: number;
}

/**
 * L'**écriture** du registre des contextes de vente.
 *
 * Séparé de `SalesContextRegistry`, qui lit : les canaux et les projections
 * itèrent le registre à chaque geste de catalogue, et n'ont aucune raison de
 * voir passer une écriture. Ce port-ci ne sert qu'à la surface d'administration,
 * qui est murée derrière `catalog:write` — le seul droit que porte l'admin.
 */
export abstract class SalesContextRepository {
  abstract findByKey(key: string): Promise<SalesContextAggregate | null>;
  /** Le rang libre en fin de registre — un contexte neuf se pose après les autres. */
  abstract nextPosition(): Promise<number>;
  abstract add(context: SalesContextAggregate, ticket: WriteTicket): Promise<void>;
  abstract save(context: SalesContextAggregate, ticket: WriteTicket): Promise<void>;
  /**
   * N'écrit QUE `archived_at` — pour l'archive et la restauration. Le geste
   * charge l'agrégat sous verrou, mais un renommage concurrent peut l'avoir
   * précédé : réécrire toute la ligne effacerait ce renommage.
   */
  abstract saveArchival(context: SalesContextAggregate, ticket: WriteTicket): Promise<void>;
  /**
   * Ce qui retient chaque contexte, pour toute la liste en une lecture.
   *
   * Sert l'ÉCRAN, pas un invariant : il doit pouvoir dire ce qu'une
   * désactivation emporterait avant le geste, plutôt que de laisser le refus
   * l'apprendre après. Les contextes que rien ne retient en sont absents.
   */
  abstract usageByKey(): Promise<ReadonlyMap<string, SalesContextUsage>>;
  /**
   * Les clés des contextes archivés — l'écran d'administration les montre à
   * part, avec « Restaurer ». Le registre, lui, ne les propose plus.
   */
  abstract archivedKeys(): Promise<ReadonlySet<string>>;
}
