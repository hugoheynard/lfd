import type { OrderSettlement } from "@lfd/contracts";

import type { PaymentGateway } from "../../../payments/domain/payment-gateway.js";
import type { Order } from "../../domain/entities/order.js";
import { TermsNotGrantedError } from "../../domain/errors/order-errors.js";
import type {
  AccountSettlementStanding,
  OrderGuardReader,
} from "../../domain/ports/order-guard.reader.js";

/** Devise unique de la plateforme (montants en centimes d'euro). */
const CURRENCY = "eur";

/** L'intention Stripe créée pour la commande — de quoi la rendre au client, ou l'annuler. */
export interface CreatedIntent {
  readonly paymentIntentId: string;
  readonly clientSecret: string;
}

/** Les deux ports dont la décision de règlement a besoin, et eux seuls. */
export interface SettlementPorts {
  readonly guard: Pick<OrderGuardReader, "companyStatusOf" | "settlesOnAccount">;
  readonly payments: Pick<PaymentGateway, "createIntent">;
}

/**
 * Décide le règlement de l'agrégat et crée l'intention Stripe si une carte est
 * requise (total > 0). Renvoie l'intention (pour le `clientSecret`) ou `null`
 * (différé / gratuit). L'intention est dimensionnée sur `order.totalCents`.
 *
 * La transition elle-même (`payByCard` / `deferPayment`) reste à l'agrégat :
 * ce module ne fait que choisir laquelle appeler.
 */
export async function settleOrder(
  ports: SettlementPorts,
  order: Order,
  companyId: string | null,
  settlement: OrderSettlement | null,
): Promise<CreatedIntent | null> {
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
  const intent = await ports.payments.createIntent({
    amountCents: order.totalCents,
    currency: CURRENCY,
    companyId,
  });
  order.payByCard(intent.paymentIntentId);
  return { paymentIntentId: intent.paymentIntentId, clientSecret: intent.clientSecret };
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
 * 🔴 Les termes lus sont ceux du payeur (`plan-sous-comptes.md` §2.3, T44) :
 * un site qui suit `billing` commande au compte de son principal. Le statut lu
 * reste celui de la société qui commande — un site en attente ne commande pas
 * au compte de qui que ce soit ; celui du payeur a déjà été jugé à la
 * composition (`orderPayerOf`).
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
  if ((await guard.companyStatusOf(companyId)) !== "active") {
    return "none";
  }
  return guard.settlesOnAccount(parties.payerId ?? companyId);
}
