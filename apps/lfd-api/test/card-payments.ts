import { CommandBus } from "@nestjs/cqrs";
import { ConfirmOrderPaymentCommand } from "../src/b2b/orders/application/commands/confirm-order-payment.command.js";
import type { E2eContext } from "./e2e-harness.js";

/**
 * **Règle les cartes**, comme le ferait le webhook Stripe : chaque intention de
 * paiement émise depuis le dernier appel est confirmée, par la vraie commande.
 *
 * Pourquoi les suites de production en ont besoin (2026-09-18) : une commande
 * **sans société** dont la carte est encore `pending` n'entre plus au plan du
 * soir (`planWhere`, `production-plan.ts`) — un visiteur qui abandonne devant sa
 * carte ne doit rien faire fabriquer. Et son accusé de réception attend le
 * règlement (`send-order-settled-mail.handler.ts`). Une suite qui passe une
 * commande perso et veut la voir produite doit donc la **payer**, comme un vrai
 * client.
 *
 * `issued` est la file que la passerelle simulée de la suite remplit à chaque
 * `createIntent` ; elle est vidée ici. On draine ensuite, parce que l'accusé
 * part d'un abonné, hors de la requête.
 */
export async function settleCardPayments(ctx: E2eContext, issued: string[]): Promise<void> {
  const bus = ctx.app.get(CommandBus);
  for (const paymentIntentId of issued.splice(0)) {
    await bus.execute(new ConfirmOrderPaymentCommand(paymentIntentId, "succeeded"));
  }
  await ctx.drain();
}
