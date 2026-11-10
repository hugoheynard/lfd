/**
 * **Les refus de la politique de promotions d'une mercuriale**
 * (`documentation/promotions/plan-la-mercuriale-decide.md`, § 8).
 */

import {
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/** « Au choix » sans promotion, ou une liste hors « Au choix ». */
export class InconsistentPromotionSelectionError extends DomainError {
  constructor(readonly kind: "empty" | "unexpected") {
    super(
      "pricing.mercuriale.promotion_policy.inconsistent_selection",
      kind === "empty"
        ? "« Au choix » demande au moins une promotion : cochez-en une, ou choisissez « Aucune promotion »."
        : "Seul « Au choix » porte une liste de promotions : videz la liste, ou choisissez « Au choix ».",
    );
  }
}

/** Une promotion de la liste « Au choix » qui n'existe pas. */
export class SelectedPromotionNotFoundError extends ResourceNotFoundError {
  constructor(readonly promotionIds: readonly string[]) {
    super(
      "pricing.mercuriale.promotion_policy.promotion_not_found",
      `Promotion introuvable dans la liste « Au choix » : ${promotionIds.join(", ")}. Rechargez la page et cochez de nouveau.`,
    );
  }
}
