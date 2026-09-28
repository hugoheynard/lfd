import {
  QualityCheckIncompleteError,
  QualityCheckNoteRequiredError,
  QualityCheckPhotoPositionError,
  QualityCheckTooManyPhotosError,
} from "../errors/quality-check-errors.js";
import type { ServiceDay } from "../value-objects/service-day.value-object.js";
import {
  qualityCheckTargetOf,
  type QualityCheckTarget,
  type QualityCheckTargetInput,
} from "../value-objects/quality-check-target.js";

/** Les trois verdicts (§0). `warning` se dit « Réserve » à l'écran. */
export const QUALITY_VERDICTS = ["ok", "warning", "blocking"] as const;
export type QualityVerdict = (typeof QUALITY_VERDICTS)[number];

const VERDICT_LABELS: Readonly<Record<QualityVerdict, string>> = {
  ok: "OK",
  warning: "Réserve",
  blocking: "Bloquant",
};

/** Six photos par contrôle, au plus (D8). Zéro est permis à tous les verdicts. */
export const MAX_QUALITY_PHOTOS = 6;

/** Une photo rattachée : sa place dans l'ordre d'affichage, et où elle est rangée. */
export interface QualityPhotoRef {
  readonly position: number;
  readonly storageKey: string;
}

/** Ce que l'appelant fournit pour rendre un verdict. */
export interface RenderQualityCheck {
  /** Fourni par l'écran (ULID) : c'est la clé d'idempotence (D8). */
  readonly id: string;
  readonly serviceDay: ServiceDay;
  readonly target: QualityCheckTargetInput;
  readonly verdict: QualityVerdict;
  readonly note: string | null;
  readonly checkedBy: string;
  /** L'instant du `Clock`, lu par le handler : l'entité reste pure. */
  readonly checkedAt: Date;
  readonly photos: readonly QualityPhotoRef[];
}

/**
 * **Un contrôle qualité** — un verdict rendu par le superviseur, une fois pour
 * toutes (`documentation/production/plan-controle-qualite.md`, D2).
 *
 * Il n'a **aucune méthode de mutation**, et c'est la règle : un contrôle est une
 * ligne jamais réécrite. Lever un blocage, c'est rendre un nouveau contrôle ;
 * le verdict courant d'une cible est le plus récent (`quality-verdicts.ts`).
 *
 * La NOTE est la seule obligation, dès la réserve ; la photo est facultative à
 * tous les verdicts (Hugo, 2026-09-28 : « trop rigide pour la vraie vie »).
 */
export class QualityCheck {
  private constructor(
    readonly id: string,
    readonly serviceDay: ServiceDay,
    readonly target: QualityCheckTarget,
    readonly verdict: QualityVerdict,
    readonly note: string | null,
    readonly checkedBy: string,
    readonly checkedAt: Date,
    readonly photos: readonly QualityPhotoRef[],
  ) {}

  /**
   * Le superviseur rend un verdict.
   *
   * @throws {QualityCheckNoteRequiredError} réserve ou blocage sans note.
   * @throws {QualityCheckTooManyPhotosError} plus de six photos.
   * @throws {QualityCheckPhotoPositionError} deux photos à la même place.
   * @throws {QualityCheckTargetError} la cible n'est ni une ligne, ni une commande.
   * @throws {QualityCheckIncompleteError} id, auteur ou clé de photo vide.
   */
  static render(input: RenderQualityCheck): QualityCheck {
    const id = required(input.id, "l'identifiant du contrôle");
    const checkedBy = required(input.checkedBy, "l'auteur du contrôle");
    const target = qualityCheckTargetOf(input.target);
    const note = noteFor(input.verdict, input.note);
    const photos = orderedPhotos(input.photos);
    return new QualityCheck(
      id,
      input.serviceDay,
      target,
      input.verdict,
      note,
      checkedBy,
      input.checkedAt,
      photos,
    );
  }

  /**
   * Relit un contrôle déjà écrit. Mêmes gardes que {@link render} : une ligne
   * que le domaine n'aurait pas pu produire n'est pas réhydratée en silence.
   */
  static restore(input: RenderQualityCheck): QualityCheck {
    return QualityCheck.render(input);
  }

  get isBlocking(): boolean {
    return this.verdict === "blocking";
  }
}

function required(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new QualityCheckIncompleteError(field);
  }
  return trimmed;
}

/** Une note blanche vaut absence : c'est ce que la contrainte en base refusera aussi. */
function noteFor(verdict: QualityVerdict, raw: string | null): string | null {
  const note = raw?.trim() ?? "";
  if (note !== "") {
    return note;
  }
  if (verdict !== "ok") {
    throw new QualityCheckNoteRequiredError(VERDICT_LABELS[verdict]);
  }
  return null;
}

function orderedPhotos(photos: readonly QualityPhotoRef[]): readonly QualityPhotoRef[] {
  if (photos.length > MAX_QUALITY_PHOTOS) {
    throw new QualityCheckTooManyPhotosError(photos.length, MAX_QUALITY_PHOTOS);
  }
  const seen = new Set<number>();
  for (const photo of photos) {
    if (!Number.isInteger(photo.position) || photo.position < 0) {
      throw new QualityCheckPhotoPositionError(`position ${photo.position} invalide`);
    }
    if (seen.has(photo.position)) {
      throw new QualityCheckPhotoPositionError(`deux photos en position ${photo.position}`);
    }
    seen.add(photo.position);
    required(photo.storageKey, "l'emplacement d'une photo");
  }
  return [...photos]
    .map((photo) => ({ position: photo.position, storageKey: photo.storageKey.trim() }))
    .sort((left, right) => left.position - right.position);
}
