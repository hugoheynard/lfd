import type { PromotionAct } from "../promotion-act.js";
import type { Promotion } from "../promotion.js";

/**
 * **Le port d'écriture des promotions** — l'agrégat entier, jamais une
 * colonne (CLAUDE.md §3.1). Aucun lecteur de prix ne passe par ici : la
 * lecture au calcul aura son propre port (lot L5), étroit.
 */
export abstract class PromotionRepository {
  /** La promotion, revalidée par l'agrégat ; `null` si elle n'existe pas. */
  abstract load(id: string): Promise<Promotion | null>;

  /**
   * La promotion, chargée SOUS LE VERROU DE SA LIGNE, dans l'unité de travail
   * de l'appelant : deux gestes concurrents sur la même promotion se jouent
   * l'un après l'autre, et le second décide sur l'état écrit par le premier
   * (une transition refusée l'est aussi en concurrence). Hors d'une unité de
   * travail, refus technique.
   */
  abstract loadLocked(id: string): Promise<Promotion | null>;

  /**
   * Écrit la promotion ET son acte, dans une transaction : l'état sans sa
   * trace n'existe pas, la trace d'une écriture refusée non plus. La portée
   * est remplacée en bloc.
   */
  abstract save(promotion: Promotion, act: PromotionAct): Promise<void>;
}
