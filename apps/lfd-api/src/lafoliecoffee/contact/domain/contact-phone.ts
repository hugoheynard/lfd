import { CONTACT_BOUNDS, type ContactLocalizedText, type ContactAudience } from "@lfd/contracts";

import { PhoneNumber } from "../../account/domain/value-objects/phone-number.js";
import { localizedText } from "./contact-text.js";
import {
  ContactPhoneIncompleteError,
  ContactPositionInvalidError,
} from "./errors/contact-errors.js";

/** Ce que le staff règle d'un numéro : tout, d'un bloc. */
export interface ContactPhoneSettings {
  readonly label: ContactLocalizedText;
  readonly number: string;
  readonly audience: ContactAudience;
  readonly position: number;
  readonly active: boolean;
}

/** Le numéro tel que la base le garde. */
export interface ContactPhoneState extends ContactPhoneSettings {
  readonly id: string;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * **Un numéro de contact de la boutique** (Hugo, 2026-10-09) — un réglage,
 * pas un agrégat à transitions (CLAUDE.md §3.1). Il garantit un libellé
 * français, un numéro valide (`PhoneNumber` : chiffres, espaces, `+ ( ) . -`,
 * 6 à 15 chiffres) et un rang entier ; il s'archive, il ne se supprime pas.
 */
export class ContactPhone {
  private constructor(private state: ContactPhoneState) {}

  static create(
    input: ContactPhoneSettings & { readonly id: string; readonly at: Date },
  ): ContactPhone {
    return new ContactPhone({
      ...validated(input),
      id: input.id,
      archivedAt: null,
      createdAt: input.at,
      updatedAt: input.at,
    });
  }

  /** Réhydrate depuis la base : le numéro revalide. */
  static rehydrate(state: ContactPhoneState): ContactPhone {
    return new ContactPhone({ ...state, ...validated(state) });
  }

  revise(settings: ContactPhoneSettings, at: Date): void {
    this.state = { ...this.state, ...validated(settings), updatedAt: at };
  }

  /** Idempotent : archiver un numéro archivé ne change pas sa date. */
  archive(at: Date): void {
    if (this.state.archivedAt !== null) {
      return;
    }
    this.state = { ...this.state, archivedAt: at, updatedAt: at };
  }

  get id(): string {
    return this.state.id;
  }

  toPersistence(): ContactPhoneState {
    return this.state;
  }
}

function validated(input: ContactPhoneSettings): ContactPhoneSettings {
  const label = localizedText("Libellé du numéro", input.label, CONTACT_BOUNDS.phoneLabel);
  if (label.fr === "") {
    throw new ContactPhoneIncompleteError("label");
  }
  const number = PhoneNumber.create(input.number);
  if (number.isEmpty) {
    throw new ContactPhoneIncompleteError("number");
  }
  if (!Number.isInteger(input.position) || input.position < 0) {
    throw new ContactPositionInvalidError(input.position);
  }
  return {
    label,
    number: number.value,
    audience: input.audience,
    position: input.position,
    active: input.active,
  };
}
