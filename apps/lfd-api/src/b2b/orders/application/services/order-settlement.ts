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
    (await requiresCardFor(ports.guard, companyId, settlement)) && order.totalCents > 0;
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
  companyId: string | null,
  settlement: OrderSettlement | null,
): Promise<boolean> {
  const standing = await accountStanding(guard, companyId);
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

/**
 * Une société **active** à qui un crédit a été accordé, et dont le
 * prélèvement n'est pas bloqué, peut régler au compte.
 *
 * Sans entreprise, ou entreprise non activée : jamais. Le crédit se négocie
 * avec une société cliente, pas avec un panier.
 */
async function accountStanding(
  guard: SettlementPorts["guard"],
  companyId: string | null,
): Promise<AccountSettlementStanding> {
  if (companyId === null) {
    return "none";
  }
  if ((await guard.companyStatusOf(companyId)) !== "active") {
    return "none";
  }
  return guard.settlesOnAccount(companyId);
}
