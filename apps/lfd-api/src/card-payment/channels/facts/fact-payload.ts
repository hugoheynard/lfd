import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/**
 * La charge d'un fait de `card-payment` ne se lit pas — faute de l'émetteur,
 * jamais de l'abonné. Le relais la garde en lettre morte.
 */
export class CardPaymentFactPayloadError extends TechnicalError {
  constructor(type: string, field: string) {
    super(
      "card_payment.fact.payload",
      `Fait « ${type} » illisible : le champ « ${field} » manque ou n'a pas la forme attendue.`,
    );
  }
}

type Payload = Readonly<Record<string, unknown>>;

/** Une chaîne non vide, ou le refus nommé. */
export function text(payload: Payload, type: string, field: string): string {
  const value = payload[field];
  if (typeof value !== "string" || value === "") {
    throw new CardPaymentFactPayloadError(type, field);
  }
  return value;
}

/** Une chaîne, ou `null`. */
export function optionalText(payload: Payload, type: string, field: string): string | null {
  const value = payload[field];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new CardPaymentFactPayloadError(type, field);
  }
  return value;
}

/** Un entier de centimes. */
export function cents(payload: Payload, type: string, field: string): number {
  const value = payload[field];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new CardPaymentFactPayloadError(type, field);
  }
  return value;
}

/** Un instant ISO. */
export function instant(payload: Payload, type: string, field: string): Date {
  const parsed = new Date(text(payload, type, field));
  if (Number.isNaN(parsed.getTime())) {
    throw new CardPaymentFactPayloadError(type, field);
  }
  return parsed;
}

/** Une valeur parmi une liste fermée. */
export function oneOf<T extends string>(
  payload: Payload,
  type: string,
  field: string,
  allowed: readonly T[],
): T {
  const value = text(payload, type, field);
  const known = allowed.find((candidate) => candidate === value);
  if (known === undefined) {
    throw new CardPaymentFactPayloadError(type, field);
  }
  return known;
}

/** Un objet imbriqué, ou `null`. */
export function optionalRecord(payload: Payload, type: string, field: string): Payload | null {
  const value = payload[field];
  if (value === null || value === undefined) {
    return null;
  }
  if (!isRecord(value)) {
    throw new CardPaymentFactPayloadError(type, field);
  }
  return value;
}

function isRecord(value: unknown): value is Payload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
