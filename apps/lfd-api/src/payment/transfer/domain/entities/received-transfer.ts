import type { TransferPart } from "../../../channels/requests/bank-transfers.js";
import { InvalidReceivedTransferError } from "../errors/received-transfer-errors.js";

/** La longueur d'une référence lue sur un relevé (SEPA : 140 caractères). */
export const TRANSFER_REFERENCE_MAX = 140;

const DAY = /^\d{4}-\d{2}-\d{2}$/u;

/** Ce que l'appelant demande d'enregistrer. */
export interface ReceivedTransferInput {
  readonly id: string;
  readonly receivedInto: string;
  readonly payerRef: string;
  readonly amountCents: number;
  readonly receivedOn: string;
  readonly reference: string;
  readonly recordedAt: Date;
  readonly recordedBy: string;
  readonly parts: readonly TransferPart[];
}

export type ReceivedTransferState = ReceivedTransferInput;

/**
 * **Un virement reçu, et ses parts** (plan
 * `documentation/payment/le-bloc-payment.md`) : la
 * mécanique de l'argent, sans métier. Elle ne sait pas ce qu'est une facture,
 * seulement qu'un sujet opaque reçoit une part.
 *
 * Sa règle : montant positif, jour bien formé, référence non vide et bornée,
 * au moins une part, chaque part positive, pas deux fois le même sujet, et la
 * **somme des parts égale au montant** — pas de virement à moitié réparti.
 * L'unicité d'un sujet entre deux virements est tenue par la base.
 *
 * Un virement enregistré ne change plus : la base le tient en ajout seul.
 */
export class ReceivedTransfer {
  private constructor(private readonly state: ReceivedTransferState) {}

  /** @throws {InvalidReceivedTransferError} la saisie contredit la règle du bloc. */
  static record(input: ReceivedTransferInput): ReceivedTransfer {
    const refuse = (rule: string): never => {
      throw new InvalidReceivedTransferError(input.id, rule);
    };
    if (
      input.id.trim() === "" ||
      input.receivedInto.trim() === "" ||
      input.payerRef.trim() === ""
    ) {
      refuse("identifiant, entité qui reçoit et payeur sont obligatoires");
    }
    if (!isPositiveCents(input.amountCents)) {
      refuse("le montant doit être un nombre positif de centimes");
    }
    if (!DAY.test(input.receivedOn) || Number.isNaN(Date.parse(input.receivedOn))) {
      refuse(`le jour de réception « ${input.receivedOn} » n'est pas une date`);
    }
    const reference = input.reference.trim();
    if (reference === "" || reference.length > TRANSFER_REFERENCE_MAX) {
      refuse(`la référence est obligatoire, ${TRANSFER_REFERENCE_MAX} caractères au plus`);
    }
    assertParts(input, refuse);
    return new ReceivedTransfer({ ...input, reference });
  }

  get id(): string {
    return this.state.id;
  }

  toState(): ReceivedTransferState {
    return this.state;
  }
}

function assertParts(input: ReceivedTransferInput, refuse: (rule: string) => never): void {
  if (input.parts.length === 0) {
    refuse("un virement règle au moins un sujet");
  }
  const seen = new Set<string>();
  let sum = 0;
  for (const part of input.parts) {
    if (part.subject.type.trim() === "" || part.subject.id.trim() === "") {
      refuse("chaque part nomme son sujet");
    }
    const key = `${part.subject.type}/${part.subject.id}`;
    if (seen.has(key)) {
      refuse(`le sujet ${key} est cité deux fois`);
    }
    seen.add(key);
    if (!isPositiveCents(part.amountCents)) {
      refuse(`la part du sujet ${key} doit être un nombre positif de centimes`);
    }
    sum += part.amountCents;
  }
  if (sum !== input.amountCents) {
    refuse(
      `la somme des parts (${sum} centimes) ne fait pas le montant (${input.amountCents} centimes)`,
    );
  }
}

function isPositiveCents(cents: number): boolean {
  return Number.isSafeInteger(cents) && cents > 0;
}
