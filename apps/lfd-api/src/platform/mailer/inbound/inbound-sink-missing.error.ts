import { TechnicalError } from "../../shared/errors/app-error.js";

/**
 * Un e-mail reçu, sans rien pour le ranger : le port `InboundMailSink` n'est
 * relié à aucun contexte. Le webhook échoue, et Resend le rejouera une fois
 * l'application correctement assemblée.
 */
export class InboundSinkMissingError extends TechnicalError {
  constructor(emailId: string) {
    super(
      "mailer.inbound.sink_missing",
      `Le message reçu ${emailId} n'a nulle part où se ranger : le port InboundMailSink n'est pas relié (appBootstrap). Resend rejouera le webhook.`,
    );
  }
}
