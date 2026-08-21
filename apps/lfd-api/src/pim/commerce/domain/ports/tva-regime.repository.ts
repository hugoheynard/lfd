import type { TvaRegime } from "../entities/tva-regime.js";

/**
 * Port : l'application dépend de cette abstraction, jamais de Prisma.
 *
 * Il rend et reprend l'**agrégat** plutôt qu'une ligne et un tas de champs :
 * le `tag` n'est plus un paramètre qu'un appelant pourrait calculer de
 * travers, il vient du taux, qui vient du VO.
 */
export abstract class TvaRegimeRepository {
  abstract listAll(): Promise<TvaRegime[]>;
  abstract findById(id: string): Promise<TvaRegime | null>;
  abstract findByTag(tag: string): Promise<TvaRegime | null>;
  abstract add(regime: TvaRegime): Promise<void>;
  abstract save(regime: TvaRegime): Promise<void>;
  /** Refuse (`TvaRegimeInUseError`) si une famille vise encore ce régime. */
  abstract remove(id: string): Promise<void>;
}
