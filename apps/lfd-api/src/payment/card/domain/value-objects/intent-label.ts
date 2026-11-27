import { InvalidCardPaymentLabelError } from "../errors/card-payment-errors.js";

/** Les limites des métadonnées chez Stripe : 50 clés, 40 caractères par clé, 500 par valeur. */
const MAX_KEYS = 50;
const MAX_KEY_LENGTH = 40;
const MAX_VALUE_LENGTH = 500;

/** Les clés que le bloc pose lui-même : `companyId` (le `tag`) et tout `lfd_…`. */
const RESERVED_KEYS: ReadonlySet<string> = new Set(["companyId"]);
const RESERVED_PREFIX = "lfd_";

/** Le nombre de clés réservées qu'une intention porte toujours (`companyId`). */
const ALWAYS_RESERVED = RESERVED_KEYS.size;

/** Minuscules, chiffres et soulignés, une lettre en tête. */
const CALLER_KEY = /^[a-z][a-z0-9_]*$/u;

/** Ce que l'appelant demande de montrer. */
export interface IntentLabelInput {
  readonly description: string;
  readonly metadata: Readonly<Record<string, string>>;
}

/**
 * **Le libellé d'une intention, tel que le prestataire l'accepte** (plan
 * `documentation/payment/le-pointage-stripe.md`, § 2).
 *
 * Il refuse ce qui ferait échouer l'appel ou écraserait une clé du bloc — une
 * clé mal formée, réservée, ou une clé de trop —, et borne une valeur trop
 * longue plutôt que de refuser un paiement pour un texte de pointage.
 */
export class IntentLabel {
  private constructor(
    readonly description: string,
    readonly metadata: Readonly<Record<string, string>>,
  ) {}

  /** @throws {InvalidCardPaymentLabelError} description vide, clé réservée, mal formée ou de trop. */
  static of(input: IntentLabelInput): IntentLabel {
    const description = input.description.trim();
    if (description === "") {
      throw new InvalidCardPaymentLabelError("la description est vide");
    }
    return new IntentLabel(description, IntentLabel.metadataOf(input.metadata));
  }

  /**
   * Les clés de l'appelant seules, aux mêmes règles — pour un objet du
   * prestataire qui n'a pas de description à lui (un remboursement, lot 3).
   *
   * @throws {InvalidCardPaymentLabelError} clé réservée, mal formée ou de trop.
   */
  static metadataOf(input: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
    const entries = Object.entries(input);
    if (entries.length + ALWAYS_RESERVED > MAX_KEYS) {
      throw new InvalidCardPaymentLabelError(
        `${String(entries.length)} clés, le prestataire en admet ${String(MAX_KEYS - ALWAYS_RESERVED)}`,
      );
    }
    const metadata: Record<string, string> = {};
    for (const [key, value] of entries) {
      ensureCallerKey(key);
      metadata[key] = bounded(value);
    }
    return metadata;
  }
}

function ensureCallerKey(key: string): void {
  if (!CALLER_KEY.test(key) || key.length > MAX_KEY_LENGTH) {
    throw new InvalidCardPaymentLabelError(
      `la clé « ${key} » doit tenir en ${String(MAX_KEY_LENGTH)} minuscules, chiffres ou soulignés`,
    );
  }
  if (RESERVED_KEYS.has(key) || key.startsWith(RESERVED_PREFIX)) {
    throw new InvalidCardPaymentLabelError(`la clé « ${key} » est réservée au bloc payment`);
  }
}

function bounded(value: string): string {
  return value.length <= MAX_VALUE_LENGTH ? value : value.slice(0, MAX_VALUE_LENGTH);
}
