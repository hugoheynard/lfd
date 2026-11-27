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
   * dépend de la quantité, qui se règle après le dépôt.
   */
  readonly quantityIndependent: boolean;
}

/** La question, pour toute la grille affichée. */
export interface PlannedBasketCheckRequest {
  readonly companyId: string;
  readonly items: readonly PlannedBasketCheckItem[];
}

/**
 * **« Que dirait la passation de ce panier ? »** — déclaré par le
 * planificateur, implémenté par le commerce avec les juges mêmes de la
 * passation d'une échéance : heure limite sans dérogation, article servi à la
 * société (plan du planificateur, § 4 bis). L'avertissement à l'écran et le
 * refus à la conversion sortent du même calcul, et ne peuvent pas diverger.
 *
 * Une question par grille, pas par colonne. Ne dépense rien, n'écrit rien.
 * Rend une réponse par article demandé, dans l'ordre demandé.
 */
export abstract class PlannedBasketCheck {
  abstract check(request: PlannedBasketCheckRequest): Promise<readonly PlannedLineCheck[]>;
}
