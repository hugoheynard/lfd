import type { GeneralDiscountPayload } from "@lfd/contracts";

import type { GeneralDiscount } from "../../domain/entities/company-mercuriale.js";
import { VolumeCommitmentReader } from "../../domain/ports/volume-commitment.reader.js";
import { GeneralDiscountOverVolumeCommitmentError } from "../../domain/pricing-errors.js";

/**
 * **Q2 du plan de la remise générale** (tranchée par Hugo le 2026-11-11) : pas
 * de remise générale chez un client dont un engagement de volume court sur la
 * fenêtre où elle s'appliquerait.
 *
 * Le refus vit ici et non dans l'agrégat : la mercuriale ne connaît pas les
 * engagements. Il vise le RECOUVREMENT des deux fenêtres (bornes basses
 * incluses, hautes exclues), pas seulement « un engagement court
 * aujourd'hui » : une remise posée pour janvier scellerait aussi un engagement
 * qui commence en janvier.
 *
 * @throws {GeneralDiscountOverVolumeCommitmentError} un engagement vivant recouvre la fenêtre.
 */
export async function assertNoVolumeCommitmentUnder(
  commitments: VolumeCommitmentReader,
  companyId: string,
  from: Date,
  to: Date | null,
): Promise<void> {
  const live = await commitments.liveFor(companyId);
  const overlapping = live.some(
    (commitment) =>
      commitment.validTo.getTime() > from.getTime() &&
      (to === null || commitment.validFrom.getTime() < to.getTime()),
  );
  if (overlapping) {
    throw new GeneralDiscountOverVolumeCommitmentError(companyId);
  }
}

/** Le contrat → la forme du domaine, qui la vérifie. */
export function generalDiscountOf(payload: GeneralDiscountPayload): GeneralDiscount {
  return {
    mode: payload.mode,
    baseBp: payload.baseBp,
    rules: payload.rules.map((rule) => ({
      target: rule.target,
      targetId: rule.targetId,
      bp: rule.bp,
    })),
  };
}
