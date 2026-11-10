import type { OrderSettlement } from "@lfd/contracts";

import type {
  CardPaymentPreparation,
  CardPayments,
} from "../../../../card-payment/channels/requests/index.js";
import type { Order } from "../../domain/entities/order.js";
import { TermsNotGrantedError } from "../../domain/errors/order-errors.js";
import type { OrderCompanyStatus } from "../../domain/ports/company-status.reader.js";
import type {
  AccountSettlementStanding,
  OrderGuardReader,
} from "../../domain/ports/order-guard.reader.js";
import { ORDER_CARD_SUBJECT_TYPE, orderCardTag } from "./order-card-subject.js";

/** Les deux ports dont la décision de règlement a besoin, et eux seuls. */
export interface SettlementPorts {
  readonly guard: Pick<OrderGuardReader, "companyStatusOf" | "settlesOnAccount">;
  readonly payments: Pick<CardPayments, "prepare">;
}

/**
 * Décide le règlement de l'agrégat et PRÉPARE l'intention de carte si une
 * carte est requise (total > 0) — hors transaction, par le bloc
 * `card-payment` (plan M2, §4.2), qui choisit le compte. Renvoie la
 * préparation (le `clientSecret`, la clé publique, et ce que la passation
 * rattachera dans sa transaction) ou `null` (différé / gratuit). L'intention
 * est dimensionnée sur `order.totalCents`.
 *
 * La transition elle-même (`payByCard` / `deferPayment`) reste à l'agrégat :
 * ce module ne fait que choisir laquelle appeler.
 */
export async function settleOrder(
  ports: SettlementPorts,
  order: Order,
  companyId: string | null,
  settlement: OrderSettlement | null,
): Promise<CardPaymentPreparation | null> {
  const requiresCard =
    (await requiresCardFor(
      ports.guard,
      { companyId, payerId: order.billedCompanyId },
      settlement,
    )) && order.totalCents > 0;
  if (!requiresCard) {
    order.deferPayment();
    return null;
  }
  const preparation = await ports.payments.prepare(
    ORDER_CARD_SUBJECT_TYPE,
    order.totalCents,
    orderCardTag(companyId),
  );
  // `orders.stripe_payment_intent_id` reste écrit (§4.2) : la compatibilité
  // jusqu'à P2, et la clé de `markPaid`.
  order.payByCard(preparation.prepared.providerRef);
  return preparation;
}

/**
 * **La carte est-elle requise ?** — le choix du client d'abord, la règle ensuite.
 *
 * @throws {TermsNotGrantedError} le compte a été demandé sans crédit accordé.
 */
async function requiresCardFor(
  guard: SettlementPorts["guard"],
  parties: SettlementParties,
  settlement: OrderSettlement | null,
): Promise<boolean> {
  const { companyId } = parties;
  const standing = await accountStanding(guard, parties);
  const onAccount = standing === "granted";
  // **Payer comptant est toujours possible**, y compris pour une société à qui
  // le mensuel a été accordé. Le crédit est une facilité, pas une obligation :
  // un client qui veut régler tout de suite avec SON tarif doit pouvoir le
  // faire, et c'est exactement ce que la boutique lui demandera.
  if (settlement === "card") {
    return true;
  }
  // Le compte se REFUSE plutôt que de se rabattre en silence sur la carte :
  // prélever quelqu'un qui croyait commander au compte est le genre de
  // surprise qui se règle au téléphone.
  if (settlement === "account") {
    if (!onAccount) {
      throw new TermsNotGrantedError(companyId, standing === "blocked");
    }
    return false;
  }
  // Rien de demandé : la décision d'avant, mot pour mot. C'est le chemin du
  // back-office, qui n'a personne devant l'écran pour choisir. Un prélèvement
  // bloqué y bascule sur la carte en silence — personne n'a demandé le compte.
  return !onAccount;
}

/** La société qui commande, et le payeur copié sur la commande. */
export interface SettlementParties {
  readonly companyId: string | null;
  /** `null` sans société ; la société elle-même quand elle paie seule. */
  readonly payerId: string | null;
}

/**
 * Une société **active** dont le PAYEUR a un crédit accordé, et un
 * prélèvement non bloqué, peut régler au compte.
 *
 * 🔴 Les termes lus sont ceux du payeur (`sous-comptes.md` §2.3, T44) :
 * un site qui suit `billing` commande au compte de son principal. Le statut
 * lu est celui de la société qui commande — un site en attente ne commande
 * pas au compte de qui que ce soit — PUIS celui du payeur
 * ({@link settlingStatusOf}) : un principal suspendu après la passation ne
 * règle plus au compte (Hugo, 2026-11-03,
 * `documentation/comptes-client/plan-suspendue-au-prix-pro.md` § 5, décision 2).
 *
 * Sans entreprise, ou entreprise non activée : jamais. Le crédit se négocie
 * avec une société cliente, pas avec un panier.
 */
export async function accountStanding(
  guard: SettlementPorts["guard"],
  parties: SettlementParties,
): Promise<AccountSettlementStanding> {
  const { companyId } = parties;
  if (companyId === null) {
    return "none";
  }
  const status = await settlingStatusOf(
    guard,
    companyId,
    parties.payerId,
    await guard.companyStatusOf(companyId),
  );
  return status === "active" ? guard.settlesOnAccount(parties.payerId ?? companyId) : "none";
}

/**
 * **Le statut qui juge le crédit** : celui de la société qui commande, déjà
 * lu par l'appelant, puis celui du PAYEUR quand c'en est un autre (décision
 * 2 du plan `plan-suspendue-au-prix-pro.md`, 2026-11-03). Une suspension ne
 * touche plus qu'au crédit, et le crédit est celui du payeur : un site actif
 * dont le principal payeur est suspendu ne règle plus au compte.
 *
 * Le payeur n'est relu que s'il est distinct et que la société est active —
 * la lecture du statut d'une société qui paie seule ne double pas.
 */
export async function settlingStatusOf(
  guard: Pick<SettlementPorts["guard"], "companyStatusOf">,
  companyId: string,
  payerId: string | null,
  status: OrderCompanyStatus | null,
): Promise<OrderCompanyStatus | null> {
  if (status !== "active" || payerId === null || payerId === companyId) {
    return status;
  }
  return guard.companyStatusOf(payerId);
}
