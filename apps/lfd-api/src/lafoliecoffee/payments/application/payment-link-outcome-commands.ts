import { ExpirePaymentLinkCommand } from "./commands/expire-payment-link.command.js";
import { SettlePaymentLinkCommand } from "./commands/settle-payment-link.command.js";

/** Ce qu'une page hébergée de lien a donné : encaissée, ou morte sans règlement. */
export type PaymentLinkOutcome = "paid" | "expired";

/** La commande qui projette l'issue — idempotente des deux côtés (`already_paid`). */
export type PaymentLinkOutcomeCommand = SettlePaymentLinkCommand | ExpirePaymentLinkCommand;

/**
 * **L'issue d'une page de lien → la commande qui la projette**, partagée par
 * les deux chemins qui l'apportent pendant P0 (plan M2, §4.5) : l'endpoint
 * propre des liens, et le relais `card_payment.checkout_event` du webhook des
 * cartes. Une table exhaustive : une issue de plus sans sa commande ne
 * compile pas.
 */
const COMMANDS: Readonly<
  Record<PaymentLinkOutcome, (sessionId: string) => PaymentLinkOutcomeCommand>
> = {
  paid: (sessionId) => new SettlePaymentLinkCommand(sessionId),
  expired: (sessionId) => new ExpirePaymentLinkCommand(sessionId),
};

export function paymentLinkCommandFor(
  outcome: PaymentLinkOutcome,
  sessionId: string,
): PaymentLinkOutcomeCommand {
  return COMMANDS[outcome](sessionId);
}
