import type { TvaRate } from "../entities/tva-rate.js";

/**
 * Combien de familles visent un taux, par mode de vente.
 *
 * Une **projection de lecture**, pas un état de l'agrégat : `TvaRate` n'a
 * aucun invariant qui dépende de ce compte, et le lui faire porter obligerait
 * à le recompter à chaque `save()` pour rien.
 */
export interface TvaRateUsage {
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
export abstract class TvaRateRepository {
  abstract listAll(): Promise<TvaRate[]>;
  abstract findById(id: string): Promise<TvaRate | null>;
  /** Le taux qui porte ce taux, s'il existe — l'unicité est fiscale. */
  abstract findByPercent(percent: number): Promise<TvaRate | null>;
  abstract add(regime: TvaRate): Promise<void>;
  abstract save(regime: TvaRate): Promise<void>;
  /** Refuse (`TvaRateInUseError`) si une famille vise encore ce taux. */
  abstract remove(id: string): Promise<void>;
  /**
   * Le compte d'usages par id de taux — un seul aller-retour pour toute la
   * liste, et non un `count` par ligne. Les taux sans usage en sont absents.
   */
  abstract usageByRegime(): Promise<ReadonlyMap<string, TvaRateUsage>>;
}
