import { DomainError } from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus du **contrôle qualité** (`documentation/production/plan-controle-qualite.md`).
 *
 * Tous des `DomainError` : chacun dit « ce contrôle ne peut pas exister ». Aucun
 * ne dépend d'un état de la journée — un contrôle est facultatif (Q2), et rien
 * ne l'interdit en dehors de sa propre forme.
 */

/** Une réserve ou un blocage sans note : la note est la SEULE obligation (§0). */
export class QualityCheckNoteRequiredError extends DomainError {
  constructor(verdictLabel: string) {
    super(
      "production.quality.note_required",
      `Un verdict « ${verdictLabel} » demande une note : écrivez ce que vous avez vu avant d'enregistrer.`,
    );
  }
}

/** Plus de photos que le contrôle n'en accepte (D8). */
export class QualityCheckTooManyPhotosError extends DomainError {
  constructor(count: number, max: number) {
    super(
      "production.quality.too_many_photos",
      `${count} photos jointes : un contrôle en accepte ${max} au plus. Retirez-en avant d'enregistrer.`,
    );
  }
}

/** Deux photos à la même place : l'ordre d'affichage serait indécidable (D2). */
export class QualityCheckPhotoPositionError extends DomainError {
  constructor(reason: string) {
    super("production.quality.photo_position", `Photos du contrôle mal rangées : ${reason}.`);
  }
}

/** Une cible qui n'est ni exactement une ligne, ni exactement une commande (D2). */
export class QualityCheckTargetError extends DomainError {
  constructor(reason: string) {
    super(
      "production.quality.invalid_target",
      `Ce contrôle ne vise rien de contrôlable : ${reason}. Contrôlez une ligne de préparation ou une commande colisée.`,
    );
  }
}

/** Un champ d'identité manquant : id, auteur, référence de photo. */
export class QualityCheckIncompleteError extends DomainError {
  constructor(field: string) {
    super("production.quality.incomplete", `Contrôle incomplet : ${field} manquant.`);
  }
}
