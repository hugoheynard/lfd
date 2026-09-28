/**
 * **Déposer une photo de contrôle**, seule, dès qu'elle est prise (plan
 * `plan-controle-qualite.md`, D8, première moitié du geste).
 *
 * Les octets arrivent bruts : `QualityPhoto` les refuse ou les reconnaît.
 */
export class DepositQualityPhotoCommand {
  constructor(
    readonly bytes: Buffer | null,
    /** L'identité staff, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
  ) {}
}
