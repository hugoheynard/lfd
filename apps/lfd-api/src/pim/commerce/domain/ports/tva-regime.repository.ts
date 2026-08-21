import type { TvaRegime } from "../entities/tva-regime.js";

/**
 * Combien de familles visent un régime, par mode de vente.
 *
 * Une **projection de lecture**, pas un état de l'agrégat : `TvaRegime` n'a
 * aucun invariant qui dépende de ce compte, et le lui faire porter obligerait
 * à le recompter à chaque `save()` pour rien.
 */
export interface TvaRegimeUsage {
  readonly emporter: number;
  readonly surPlace: number;
}

/**
 * Port : l'application dépend de cette abstraction, jamais de Prisma.
 *
 * Il rend et reprend l'**agrégat** plutôt qu'une ligne et un tas de champs :
 * le taux n'est plus un nombre qu'un appelant pourrait passer de travers, il
 * vient du VO qui le valide.
 */
export abstract class TvaRegimeRepository {
  abstract listAll(): Promise<TvaRegime[]>;
  abstract findById(id: string): Promise<TvaRegime | null>;
  /** Le régime qui porte ce taux, s'il existe — l'unicité est fiscale. */
  abstract findByPercent(percent: number): Promise<TvaRegime | null>;
  abstract add(regime: TvaRegime): Promise<void>;
  abstract save(regime: TvaRegime): Promise<void>;
  /** Refuse (`TvaRegimeInUseError`) si une famille vise encore ce régime. */
  abstract remove(id: string): Promise<void>;
  /**
   * Le compte d'usages par id de régime — un seul aller-retour pour toute la
   * liste, et non un `count` par ligne. Les régimes sans usage en sont absents.
   */
  abstract usageByRegime(): Promise<ReadonlyMap<string, TvaRegimeUsage>>;
}
