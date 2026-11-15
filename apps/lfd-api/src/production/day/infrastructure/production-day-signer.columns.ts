import {
  AUTO_CLOSE_ACTOR,
  AUTOMATIC_SIGNER,
  type PlanSigner,
  staffSigner,
} from "../domain/entities/plan-signer.js";

/**
 * Les colonnes de l'auteur de l'arrêt (`production_day.closed_by`,
 * `closed_by_name`, migration `20261006220000`) ↔ {@link PlanSigner}.
 */
/** `closed_by` + `closed_by_name` → l'auteur de l'arrêt ; `null` : inconnu (journée d'avant). */
export function signerOf(closedBy: string | null, closedByName: string | null): PlanSigner | null {
  if (closedBy === null) {
    return null;
  }
  return closedBy === AUTO_CLOSE_ACTOR ? AUTOMATIC_SIGNER : staffSigner(closedBy, closedByName);
}

export function signerColumns(signer: PlanSigner | null): {
  readonly closedBy: string | null;
  readonly closedByName: string | null;
} {
  if (signer === null) {
    return { closedBy: null, closedByName: null };
  }
  return signer.kind === "automatic"
    ? { closedBy: AUTO_CLOSE_ACTOR, closedByName: null }
    : { closedBy: signer.staffUserId, closedByName: signer.name };
}
