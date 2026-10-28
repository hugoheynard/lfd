import { TechnicalError } from "../../shared/errors/app-error.js";

/**
 * Un e-mail reçu que Resend ne rend pas : le webhook échoue, et Resend le
 * rejoue. Le message ne cite que l'identifiant Resend, jamais l'expéditeur.
 */
export class InboundMailUnreadableError extends TechnicalError {
  constructor(emailId: string, reason: string, cause?: unknown) {
    super(
      "mailer.inbound.unreadable",
      `Le message reçu ${emailId} n'a pas pu être lu chez Resend (${reason}) : Resend rejouera le webhook. Si cela dure, vérifier la clé RESEND_API_KEY et l'état de Resend.`,
      cause,
    );
  }
}
