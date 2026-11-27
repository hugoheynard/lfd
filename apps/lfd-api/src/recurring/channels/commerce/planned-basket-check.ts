import type { OccurrenceRefusalCause } from "../../occurrence/domain/refusal-cause.js";

/**
 * Un article demandé pour un jour : une ligne d'une colonne (`columnId`), ou
 * un article de la liste d'envies ce jour-là (`columnId` à `null`). Les juges
 * d'aujourd'hui ne dépendent pas du créneau ; la colonne est rendue telle
 * quelle, pour qu'un juge qui en dépendrait réponde par colonne.
 */
export interface PlannedBasketCheckItem {
  readonly sku: string;
  /** `AAAA-MM-JJ`. */
  readonly day: string;
  readonly columnId: string | null;
  /**
   * La quantité de la ligne ; `null` pour un article de la liste d'envies,
   * dont la quantité se règle après le dépôt : seuls les juges qui tiennent à
   * l'article et au jour lui répondent.
   */
  readonly quantity: number | null;
}

/** Ce qui ferait refuser la passation de cet article ce jour-là. */
export interface PlannedLineBlocking {
  readonly cause: OccurrenceRefusalCause;
  /** La phrase même que le refus de la passation porterait. */
  readonly reason: string;
}

/** **Ce que dirait la passation** d'un article un jour donné. */
export interface PlannedLineCheck {
  readonly sku: string;
  readonly day: string;
  readonly columnId: string | null;
  /** L'instant où l'article ferme ce jour-là, sans dérogation ; `null` : rien à opposer. */
  readonly closesAt: Date | null;
  readonly blocking: PlannedLineBlocking | null;
  /**
   * Vrai quand le blocage (ou l'absence de blocage) tient à l'article et au
   * jour seuls : l'écran grise la colonne pendant un glisser. Faux quand il
   * dépend de la quantité, qui se règle après le dépôt (le minimum d'achat),
   * ou de la société entière (boutique fermée, règlement au compte
   * impossible, acheteur parti) : griser un jour n'y changerait rien.
   */
  readonly quantityIndependent: boolean;
}

/** La question, pour toute la grille affichée. */
export interface PlannedBasketCheckRequest {
  readonly companyId: string;
  /** Qui commanderait : l'acheteur de la colonne, ou la personne devant l'écran. */
  readonly buyerUserId: string;
  readonly items: readonly PlannedBasketCheckItem[];
}

/**
 * **« Que dirait la passation de ce panier ? »** — déclaré par le
 * planificateur, implémenté par le commerce avec les juges mêmes de la
 * passation d'une échéance : la société et son règlement au compte, le jour
 * (premier jour commandable, plan arrêté, jour même), l'article servi à la
 * société, l'heure limite sans dérogation, le minimum d'achat (plan du
 * planificateur, § 4 bis). L'avertissement à l'écran et le
 * refus à la conversion sortent du même calcul, et ne peuvent pas diverger.
 *
 * Une question par grille, pas par colonne. Ne dépense rien, n'écrit rien.
 * Rend une réponse par article demandé, dans l'ordre demandé.
 */
export abstract class PlannedBasketCheck {
  abstract check(request: PlannedBasketCheckRequest): Promise<readonly PlannedLineCheck[]>;
}
