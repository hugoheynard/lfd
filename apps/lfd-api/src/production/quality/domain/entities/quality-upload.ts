import {
  QualityUploadAlreadyAttachedError,
  QualityUploadNotFoundError,
  QualityUploadReleasedError,
} from "../errors/quality-record-errors.js";
import { pendingQualityPhotoKey } from "../services/quality-storage-keys.js";
import type { QualityPhoto } from "../value-objects/quality-photo.js";

/** Un dépôt jamais rattaché se balaie au bout de 24 h (D8) : il ne coûte qu'une nuit. */
export const QUALITY_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

/** La forme d'un dépôt relu en base. */
export interface QualityUploadState {
  readonly id: string;
  readonly storageKey: string;
  readonly contentType: string;
  readonly byteSize: number;
  readonly uploadedBy: string;
  readonly uploadedAt: Date;
  /** Le contrôle qui l'a rattaché, ou `null`. */
  readonly attachedTo: string | null;
  /** L'objet provisoire a été retiré du stockage, ou `null`. */
  readonly releasedAt: Date | null;
}

/**
 * **Une photo déposée en attente de son verdict** (D8, première moitié du geste).
 *
 * Le stockage objet n'entre dans aucune transaction : la photo part seule dès
 * qu'elle est prise, et le verdict la rattache ensuite. Ce dépôt porte la seule
 * règle qui peut refuser ce rattachement — {@link assertAttachableBy} — pour
 * qu'aucun handler n'ait à la réécrire.
 */
export class QualityUpload {
  private constructor(private readonly state: QualityUploadState) {}

  /** Le superviseur dépose une photo : elle est rangée sous `quality/pending/<id>`. */
  static deposit(input: {
    readonly id: string;
    readonly photo: QualityPhoto;
    readonly uploadedBy: string;
    readonly uploadedAt: Date;
  }): QualityUpload {
    return new QualityUpload({
      id: input.id,
      storageKey: pendingQualityPhotoKey(input.id),
      contentType: input.photo.contentType,
      byteSize: input.photo.byteSize,
      uploadedBy: input.uploadedBy,
      uploadedAt: input.uploadedAt,
      attachedTo: null,
      releasedAt: null,
    });
  }

  static restore(state: QualityUploadState): QualityUpload {
    return new QualityUpload(state);
  }

  get id(): string {
    return this.state.id;
  }

  get storageKey(): string {
    return this.state.storageKey;
  }

  get contentType(): string {
    return this.state.contentType;
  }

  get byteSize(): number {
    return this.state.byteSize;
  }

  get uploadedBy(): string {
    return this.state.uploadedBy;
  }

  get uploadedAt(): Date {
    return this.state.uploadedAt;
  }

  get attachedTo(): string | null {
    return this.state.attachedTo;
  }

  /**
   * Ce dépôt peut-il documenter un verdict de cette personne ?
   *
   * Le dépôt d'un autre se dit « introuvable » : un `upload_id` d'autrui n'a
   * pas à confirmer son existence. Déjà rattaché : une photo ne documente
   * qu'un verdict. Balayé : l'objet provisoire n'existe plus.
   *
   * @throws {QualityUploadNotFoundError} le dépôt n'est pas le sien.
   * @throws {QualityUploadAlreadyAttachedError} déjà joint à un contrôle.
   * @throws {QualityUploadReleasedError} retiré par le balayage.
   */
  assertAttachableBy(staffUserId: string): void {
    if (this.state.uploadedBy !== staffUserId) {
      throw new QualityUploadNotFoundError(this.state.id);
    }
    if (this.state.attachedTo !== null) {
      throw new QualityUploadAlreadyAttachedError();
    }
    if (this.state.releasedAt !== null) {
      throw new QualityUploadReleasedError(this.state.id);
    }
  }
}
