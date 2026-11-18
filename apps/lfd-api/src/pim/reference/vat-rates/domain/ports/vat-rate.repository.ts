import type { WriteTicket } from "../../../../../platform/journal/scoped-journal.js";
import type { VatRate } from "../entities/vat-rate.js";

/**
 * Combien de familles visent un taux, **par clé de contexte de vente**. Une clé
 * absente = aucune famille ne le vise dans ce contexte.
 *
 * Une **projection de lecture**, pas un état de l'agrégat : `VatRate` n'a
 * aucun invariant qui dépende de ce compte, et le lui faire porter obligerait
 * à le recompter à chaque `save()` pour rien.
 *
 * Indexé, et non trois champs nommés : le compte dit à l'écran si l'archive
 * sera refusée, et un contexte oublié dans le total offrirait un bouton
 * « Archiver » que l'agrégat refuserait ensuite.
 */
export type VatRateUsage = Readonly<Record<string, number>>;

/**
 * Port : l'application dépend de cette abstraction, jamais de Prisma.
 *
 * Il rend et reprend l'**agrégat** plutôt qu'une ligne et un tas de champs :
 * le taux n'est plus un nombre qu'un appelant pourrait passer de travers, il
 * vient du VO qui le valide.
 */
export abstract class VatRateRepository {
  abstract listAll(): Promise<VatRate[]>;
  abstract findById(id: string): Promise<VatRate | null>;
  /** Le taux qui porte ce taux, s'il existe — l'unicité est fiscale. */
  abstract findByPercent(percent: number): Promise<VatRate | null>;
  abstract add(rate: VatRate, ticket: WriteTicket): Promise<void>;
  abstract save(rate: VatRate, ticket: WriteTicket): Promise<void>;
  /**
   * N'écrit QUE `archived_at` — pour l'archive et la restauration. Le geste
   * charge l'agrégat sous verrou, mais un renommage concurrent peut l'avoir
   * précédé : réécrire toute la ligne effacerait ce renommage.
   */
  abstract saveArchival(rate: VatRate, ticket: WriteTicket): Promise<void>;
  /**
   * Le compte d'usages par id de taux — un seul aller-retour pour toute la
   * liste, et non un `count` par ligne. Les taux sans usage en sont absents.
   */
  abstract usageByRegime(): Promise<ReadonlyMap<string, VatRateUsage>>;
}
