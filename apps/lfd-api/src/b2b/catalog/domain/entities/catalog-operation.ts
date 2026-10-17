import type { UnitPoint } from "../../../../platform/shared/geometry/unit-point.js";
import type { CatalogOperationAudience } from "../operation-audience.js";

/** Un texte d'annonce dans ses langues — le français toujours (D10). */
export interface OperationText {
  readonly fr: string;
  readonly en?: string;
  readonly it?: string;
}

/** Un point focal : deux fractions de 0 à 1, depuis le coin haut gauche. */
export type OperationFocal = UnitPoint;

/**
 * L'image d'une opération, telle que reçue. `focal` est lu à la médiathèque
 * (`documentation/mediatheque/mediatheque.md` §7 bis, 2026-10-11) : au push,
 * et sans push quand la médiathèque remplace ou redécrit l'image
 * (`pim.operation_image_changed`). Absent ou `null` — un envoi d'avant ce
 * jour-là, ou personne ne s'est prononcé : la boutique recadre au centre.
 */
export interface OperationImageFacts {
  readonly url: string;
  readonly alt: string;
  readonly focal?: OperationFocal | null | undefined;
}

/**
 * **Ce que le référentiel a dit d'une opération datée**, tel que reçu — sans
 * aucune décision de la plateforme.
 *
 * Déclaré ici et non importé du fil : le domaine du commerce ne dépend pas du
 * schéma de transport (même règle que `PimFacts`).
 */
export interface CatalogOperationFacts {
  readonly key: string;
  readonly name: OperationText;
  readonly lede: OperationText | null;
  readonly image: OperationImageFacts | null;
  /** Trois INSTANTS : le rayon paraît, la commande ouvre, la commande ferme. */
  readonly announceFrom: Date;
  /** `null` = on commande dès l'annonce. */
  readonly orderFrom: Date | null;
  readonly orderUntil: Date;
  /**
   * Deux JOURS `AAAA-MM-JJ`. Leur traduction en instant — minuit, heure de
   * Paris, le lendemain de `pickupUntil` — appartient au lecteur, par
   * `localToInstant` et jamais par un `T00:00Z` (`lint:business-day`).
   */
  readonly pickupFrom: string;
  readonly pickupUntil: string;
  readonly audience: CatalogOperationAudience;
  /** La sélection, dans l'ordre du rayon. */
  readonly skus: readonly string[];
  /** L'instant d'émission de l'envoi qui l'a écrite. */
  readonly receivedAt: Date;
}

/**
 * L'état persisté : les faits, et le retrait éventuel.
 *
 * L'agrégat qui l'écrivait (`CatalogOperation` : recevoir, rafraîchir,
 * retirer) est parti en X4 (`documentation/catalogue/plan-sans-interrupteurs.md`) :
 * plus aucun envoi ne l'écrivait depuis le push. Ces formes restent — les
 * lecteurs du miroir les rendent, et les opérations du commerce vivent dans les
 * mêmes tables.
 */
export interface CatalogOperationState {
  readonly facts: CatalogOperationFacts;
  readonly withdrawnAt: Date | null;
}
