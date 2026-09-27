import { cartAdjustmentCents, discountCentsOf } from "@lfd/contracts";

import { InvalidOrderPaymentError } from "../errors/order-errors.js";
import {
  InvalidOrderVoucherError,
  VoucherNotForCompanyOrderError,
} from "../errors/order-voucher-errors.js";
import { voucherImputationCents } from "../services/voucher-imputation.js";
import type { DraftOrderInput, OrderVoucher } from "./order.js";

/**
 * Les **gardes de montant** de `Order.draft` : chaque terme du panier arrive de
 * l'appelant à côté de l'ajustement qui le prétend, et l'agrégat vérifie que
 * l'un produit l'autre. Sortis d'`order.ts` le 2026-09-27, quand le bon de
 * fidélité en a ajouté une quatrième — le fichier dépassait sa taille.
 */

/**
 * La surtaxe correspond-elle à l'ajustement qui la prétend ?
 *
 * Même garde que pour la remise, et pour la même raison : les deux nombres
 * arrivent séparément de l'appelant, et rien d'autre ne les relie. Un montant
 * qui ne découle pas de son ajustement rendrait la trace figée mensongère —
 * c'est-à-dire pire qu'absente.
 */
export function ensureLateFeeMatches(input: DraftOrderInput, subtotalCents: number): void {
  const frozen = input.lateFeeAdjustment;
  if (frozen === null) {
    if (input.lateFeeCents !== 0) {
      throw new InvalidOrderPaymentError("Surtaxe sans ajustement qui la justifie.");
    }
    return;
  }
  if (cartAdjustmentCents(frozen.adjustment, subtotalCents) !== input.lateFeeCents) {
    throw new InvalidOrderPaymentError("La surtaxe ne correspond pas à son ajustement.");
  }
}

/**
 * Les frais de zone correspondent-ils au barème qui les prétend ?
 *
 * Troisième garde du même modèle, et la dernière à être posée : les deux
 * nombres arrivent séparément de l'appelant, et rien d'autre ne les relie. Un
 * montant qui ne découle pas de son barème rendrait la trace figée mensongère —
 * c'est-à-dire pire qu'absente.
 *
 * ⚠️ `cartAdjustmentCents` et **non** `discountCentsOf` : des frais ne sont pas
 * bornés par le panier. Une course peut coûter plus cher qu'un petit panier, et
 * c'est déjà la règle qui les calcule.
 *
 * L'absence d'ajustement n'est refusée que si des frais existent : une commande
 * en RETRAIT n'en a aucun, et lui en exiger un serait exiger la trace d'un
 * geste qui n'a pas eu lieu.
 */
export function ensureDeliveryFeeMatches(input: DraftOrderInput, subtotalCents: number): void {
  const frozen = input.deliveryFeeAdjustment;
  if (frozen === null) {
    if (input.deliveryFeeCents !== 0) {
      throw new InvalidOrderPaymentError("Frais de livraison sans barème qui les justifie.");
    }
    return;
  }
  if (cartAdjustmentCents(frozen, subtotalCents) !== input.deliveryFeeCents) {
    throw new InvalidOrderPaymentError("Les frais de livraison ne correspondent pas à leur zone.");
  }
}

/**
 * L'ajustement figé doit **reproduire** le montant retenu. Sans ce contrôle, une
 * commande pourrait porter « −20 % » à côté d'une remise de 12 € : le libellé et
 * le chiffre se contrediraient sur la facture, et rien ne dirait lequel ment.
 *
 * 🔴 Il compare du **borné** à du borné (`discountCentsOf`), là où il comparait
 * du brut. Une remise en montant fixe supérieure au panier — 50 € sur 10 € —
 * passait donc telle quelle et s'enregistrait à 50 € à côté d'un sous-total de
 * 10 € : la ligne ne s'additionnait pas, et elle contredisait le devis, que
 * `ventilateVat` bornait déjà de son côté. La borne est désormais posée à la
 * source, dans `CartAdjustments` ; celle-ci est la barrière de l'agrégat, qui
 * ne fait confiance à aucun appelant.
 *
 * @throws {InvalidOrderPaymentError} le libellé ne correspond pas au montant.
 */
export function ensureDiscountMatches(input: DraftOrderInput, subtotalCents: number): void {
  if (input.discountAdjustment === null) {
    return;
  }
  if (discountCentsOf(input.discountAdjustment, subtotalCents) !== input.discountCents) {
    throw new InvalidOrderPaymentError(
      "La remise retenue ne correspond pas à l'ajustement appliqué.",
    );
  }
}

/**
 * **Ce que le bon impute** (plan C1) : la remise du point de retrait s'applique
 * d'abord, le bon ensuite, plafonné au HT de marchandises restant. Il ne paie
 * jamais le port ni la surtaxe — `ventilateVat` ne retranche rien des extras.
 * Borné à zéro (§11 bis, mineurs).
 *
 * @throws {VoucherNotForCompanyOrderError} un bon sur une commande de société.
 * @throws {InvalidOrderVoucherError} une valeur qui n'est pas un entier positif.
 */
export function voucherDiscountOf(
  voucher: OrderVoucher | null,
  companyId: string | null,
  goodsAfterDiscountCents: number,
): number {
  if (voucher === null) {
    return 0;
  }
  if (companyId !== null) {
    throw new VoucherNotForCompanyOrderError();
  }
  if (!Number.isInteger(voucher.valueCents) || voucher.valueCents <= 0) {
    throw new InvalidOrderVoucherError(voucher.valueCents);
  }
  return voucherImputationCents(voucher.valueCents, goodsAfterDiscountCents);
}
