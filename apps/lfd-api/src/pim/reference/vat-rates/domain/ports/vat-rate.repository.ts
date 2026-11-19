import type { WriteTicket } from "../../../../../platform/journal/scoped-journal.js";
import type { VatRate } from "../entities/vat-rate.js";

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
}
