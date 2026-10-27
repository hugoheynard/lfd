import { ventilateVat, type VatVentilationInput } from "@lfd/money";

/**
 * **La baisse de TTC qu'un bon procure réellement** (plan des points, E2.1) :
 * le total sans le bon moins le total avec, les deux ventilés par
 * `ventilateVat` — la fonction même de la facture.
 *
 * Un bon s'impute en HT ; sa baisse TTC dépend des taux présents, du prorata
 * de la remise entre eux et des arrondis par taux. La recalculer ailleurs
 * poserait une seconde règle d'arrondi pour un même montant.
 *
 * @param withVoucher la ventilation telle que le devis la pose, bon compris
 *   dans `discountCents`.
 * @param voucherDiscountCents la part du bon dans cette remise.
 */
export function voucherTotalEffectCents(
  withVoucher: VatVentilationInput,
  voucherDiscountCents: number,
): number {
  if (voucherDiscountCents === 0) {
    return 0;
  }
  const withoutVoucher = ventilateVat({
    ...withVoucher,
    discountCents: withVoucher.discountCents - voucherDiscountCents,
  });
  return withoutVoucher.totalCents - ventilateVat(withVoucher).totalCents;
}
