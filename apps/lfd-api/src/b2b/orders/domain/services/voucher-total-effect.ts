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

/**
 * La même baisse pour une commande composée en TTC (`exact_ht`, plan
 * `documentation/pricing/plan-centime-particuliers.md`, § 4) : le total y est
 * Σ TTC des termes, et aucun autre terme ne dépend du bon — la baisse EST le
 * TTC imputé du bon, sa valeur faciale bornée (§ 10, Q2). Rien à reventiler.
 */
export function exactVoucherTotalEffectCents(composition: {
  readonly voucher: { readonly ttcCents: number };
}): number {
  return composition.voucher.ttcCents;
}
