import type { SvixHeaders } from "../../../platform/mailer/webhook/svix-signature.js";

/**
 * Commande **publique, authentifiée par signature** : un webhook Resend arrive.
 *
 * `body` est le payload **brut** — Svix signe les octets exacts, un JSON
 * re-sérialisé casserait la signature.
 */
export class ReceiveResendEventCommand {
  constructor(
    readonly headers: SvixHeaders,
    readonly body: string,
  ) {}
}

/**
 * Ce que la réception dit au contrôleur. Un verdict plutôt qu'une erreur : le
 * seul refus possible est un 401, et le motif ne doit jamais sortir.
 */
export type ResendEventReceipt = "accepted" | "refused";
