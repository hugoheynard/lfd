import { cartAdjustmentCents, discountCentsOf } from "@lfd/contracts";

import {
  EmptyOrderError,
  InvalidOrderPaymentError,
  MisplacedPickupDiscountError,
} from "../errors/order-errors.js";
import { StaffOrderLocaleError } from "../errors/order-locale-errors.js";
import {
  BilledWithoutCompanyError,
  PrincipalWithoutCompanyError,
} from "../errors/order-payer-errors.js";
import {
  InvalidOrderVoucherError,
  VoucherNotForCompanyOrderError,
} from "../errors/order-voucher-errors.js";
import { voucherImputationCents } from "../services/voucher-imputation.js";
import type { DraftOrderInput, OrderFulfillmentInput, OrderVoucher } from "./order.js";

/**
 * Les **gardes de montant** de `Order.draft` — réappliquées au bon de
 * livraison partiel par `DeliveryNoteTerms.composePartial` (plan E6, § 11) :
 * chacune ne prend que la part de la commande qu'elle lit. Chaque terme du panier arrive de
 * l'appelant à côté de l'ajustement qui le prétend, et l'agrégat vérifie que
 * l'un produit l'autre. Sortis d'`order.ts` le 2026-09-27, quand le bon de
 * fidélité en a ajouté une quatrième — le fichier dépassait sa taille.
 */

/**
 * Le prologue de `Order.draft` — une composition cohérente avant tout calcul.
 * Sorti d'`order.ts` le 2026-10-23, quand la révision y a ajouté sa méthode.
 *
 * @throws {EmptyOrderError} aucune ligne.
 * @throws {BilledWithoutCompanyError} un payeur sans société (image du CHECK `order_billed_needs_company`).
 * @throws {PrincipalWithoutCompanyError} un principal sans société.
 * @throws {StaffOrderLocaleError} une langue sur une saisie du staff.
 * @throws {InvalidOrderPaymentError} un terme négatif.
 */
export function ensureDraftable(input: DraftOrderInput): void {
  if (input.lines.length === 0) {
    throw new EmptyOrderError();
  }
  if (input.companyId === null && input.billedCompanyId !== null) {
    throw new BilledWithoutCompanyError();
  }
  if (input.companyId === null && input.principal !== null) {
    throw new PrincipalWithoutCompanyError();
  }
  if (input.placedByStaffId !== null && input.locale !== null) {
    throw new StaffOrderLocaleError();
  }
  if (input.discountCents < 0 || input.deliveryFeeCents < 0 || input.lateFeeCents < 0) {
    throw new InvalidOrderPaymentError("Remise, frais et surtaxe doivent être positifs.");
  }
}

/**
 * La surtaxe correspond-elle à l'ajustement qui la prétend ?
 *
 * Même garde que pour la remise, et pour la même raison : les deux nombres
 * arrivent séparément de l'appelant, et rien d'autre ne les relie. Un montant
 * qui ne découle pas de son ajustement rendrait la trace figée mensongère —
 * c'est-à-dire pire qu'absente.
 */
export function ensureLateFeeMatches(
  input: Pick<DraftOrderInput, "lateFeeAdjustment" | "lateFeeCents">,
  subtotalCents: number,
): void {
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
export function ensureDeliveryFeeMatches(
  input: Pick<DraftOrderInput, "deliveryFeeAdjustment" | "deliveryFeeCents">,
  subtotalCents: number,
): void {
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
 * 🔴 **L'assiette est celle des lignes éligibles**, recalculée par l'agrégat à
 * partir du drapeau de ses lignes (V1 du plan
 * `plan-remise-retrait-par-clientele-et-exclusions.md`) : recevoir l'assiette
 * de l'appelant, c'était lui faire confiance sur le seul nombre qui compte.
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
export function ensureDiscountMatches(
  input: Pick<DraftOrderInput, "discountAdjustment" | "discountCents">,
  eligibleSubtotalCents: number,
): void {
  if (input.discountAdjustment === null) {
    return;
  }
  if (discountCentsOf(input.discountAdjustment, eligibleSubtotalCents) !== input.discountCents) {
    throw new InvalidOrderPaymentError(
      "La remise retenue ne correspond pas à l'ajustement appliqué.",
    );
  }
}

/**
 * Une remise de retrait n'existe que sur une commande **retirée** — frais ou
 * pas — et une commande retirée n'a pas de port (V5 du plan
 * `plan-remise-retrait-par-clientele-et-exclusions.md`, Hugo, 2026-10-22).
 * Lu sur le montant ET sur la trace figée : un ajustement de remise qui rend
 * zéro reste une remise de retrait posée au mauvais endroit.
 *
 * @throws {MisplacedPickupDiscountError} remise sur une commande livrée, ou
 * à côté de frais de livraison sur un retrait.
 */
export function ensurePickupDiscountOnlyOnPickup(
  input: DraftOrderInput,
  fulfillment: OrderFulfillmentInput,
): void {
  if (input.discountCents === 0 && input.discountAdjustment === null) {
    return;
  }
  if (fulfillment.method !== "pickup") {
    throw new MisplacedPickupDiscountError("not_picked_up");
  }
  if (input.deliveryFeeCents > 0) {
    throw new MisplacedPickupDiscountError("with_delivery_fee");
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
  ensureVoucherUsable(voucher, companyId);
  return voucherImputationCents(voucher.valueCents, goodsAfterDiscountCents);
}

/**
 * Le bon peut-il servir sur cette commande ? Commun aux deux méthodes — la
 * commande `exact_ht` impute sa valeur faciale TTC (`order-exact-amounts.ts`).
 *
 * @throws {VoucherNotForCompanyOrderError} un bon sur une commande de société.
 * @throws {InvalidOrderVoucherError} une valeur qui n'est pas un entier positif.
 */
export function ensureVoucherUsable(voucher: OrderVoucher, companyId: string | null): void {
  if (companyId !== null) {
    throw new VoucherNotForCompanyOrderError();
  }
  if (!Number.isInteger(voucher.valueCents) || voucher.valueCents <= 0) {
    throw new InvalidOrderVoucherError(voucher.valueCents);
  }
}
