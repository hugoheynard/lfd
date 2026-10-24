/**
 * **La règle de lecture des attestations d'un lot** (plan
 * `plan-page-procedure-de-prelevement.md` § 1.2) : aucune ligne ne s'efface,
 * une attestation fausse se retire par une ligne de plus, et **la dernière
 * ligne d'un (lot, sorte) fait foi**. Pur : ni lecture, ni horloge.
 */

/**
 * Les trois gestes faits hors de l'outil qu'un lot peut attester (§ 1.2,
 * § 3.3) : le contrôle CSV relu (avant dépôt), la remise signée sur CENET
 * (après « Marquer déposé »), les accusés PSR lus. Des VALEURS : elles vivent
 * en base (CHECK `collection_batch_attestation_kind_known`).
 */
export const BATCH_ATTESTATION_KINDS = ["audit_reviewed", "remittance_signed", "psr_read"] as const;
export type BatchAttestationKind = (typeof BATCH_ATTESTATION_KINDS)[number];

export function isBatchAttestationKind(value: string): value is BatchAttestationKind {
  return BATCH_ATTESTATION_KINDS.some((kind) => kind === value);
}

/** Une ligne du registre, telle que la règle la lit. */
export interface BatchAttestationLine {
  readonly id: string;
  readonly batchId: string;
  readonly kind: BatchAttestationKind;
  readonly at: Date;
  readonly staffId: string;
  readonly withdrawn: boolean;
}

/** La plus récente d'abord : l'instant, puis l'identifiant (ULID, triable). */
function laterFirst(left: BatchAttestationLine, right: BatchAttestationLine): number {
  const byTime = right.at.getTime() - left.at.getTime();
  return byTime !== 0 ? byTime : right.id.localeCompare(left.id);
}

/**
 * La ligne qui fait foi pour une sorte, parmi les lignes d'UN lot : la
 * dernière de cette sorte, si elle n'est pas un retrait.
 */
export function standingAttestationOf<T extends BatchAttestationLine>(
  lines: readonly T[],
  kind: BatchAttestationKind,
): T | null {
  const [latest] = lines.filter((line) => line.kind === kind).sort(laterFirst);
  return latest === undefined || latest.withdrawn ? null : latest;
}
