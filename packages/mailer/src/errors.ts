/**
 * Erreurs du mailer — **sans dépendance au framework** ni à une app. Même forme
 * que `@lfd/shopify-admin` : une `category` et un `code` stable, que l'app mappe
 * vers HTTP dans son filtre d'exceptions (le seul endroit qui connaît HTTP).
 */
export type MailerErrorCategory = "business" | "technical";

export class MailerError extends Error {
  readonly code: string;
  readonly category: MailerErrorCategory;
  /** Vrai quand réessayer plus tard a une chance d'aboutir. */
  readonly retryable: boolean;

  constructor(
    code: string,
    category: MailerErrorCategory,
    message: string,
    options: { retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.category = category;
    this.retryable = options.retryable ?? false;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/**
 * L'envoi a échoué chez le fournisseur (réseau, 4xx/5xx, erreur applicative).
 *
 * **Retryable** : le fournisseur peut être momentanément indisponible, et
 * l'appelant décide s'il relance, dégrade, ou avale.
 */
export class MailerSendError extends MailerError {
  constructor(message: string, cause?: unknown) {
    super("mailer.send_failed", "technical", message, { retryable: true, cause });
  }
}

/**
 * Le disjoncteur est ouvert : on considère le fournisseur en panne et on
 * échoue **vite**, sans l'appeler. Distinct de `MailerSendError` parce que rien
 * n'a été tenté — utile pour ne pas compter deux fois un incident.
 */
export class MailerCircuitOpenError extends MailerError {
  constructor(openUntilMs: number) {
    super(
      "mailer.circuit_open",
      "technical",
      `Fournisseur d'e-mail considéré en panne — envois suspendus jusqu'à ${new Date(openUntilMs).toISOString()}.`,
      { retryable: true },
    );
  }
}
