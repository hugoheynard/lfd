import {
  CONTACT_BOUNDS,
  type ContactLocalizedText,
  type ContactPriority,
  type ContactSubjectAudience,
  type CustomerAudience,
} from "@lfd/contracts";

import { EmailAddress } from "../../account/domain/value-objects/email-address.js";
import { localizedText } from "./contact-text.js";
import {
  ContactSubjectLabelMissingError,
  ContactSubjectPositionInvalidError,
} from "./errors/contact-errors.js";

/** Ce que le staff règle d'un objet : tout, d'un bloc. */
export interface ContactSubjectSettings {
  readonly label: ContactLocalizedText;
  readonly recipientEmail: string;
  readonly position: number;
  readonly active: boolean;
  readonly audience: ContactSubjectAudience;
  /** Usage interne : trie les messages à traiter, jamais montrée à la boutique. */
  readonly priority: ContactPriority;
}

/** L'objet tel que la base le garde. */
export interface ContactSubjectState extends Omit<ContactSubjectSettings, "recipientEmail"> {
  readonly id: string;
  readonly recipientEmail: EmailAddress;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * **Un objet de « Nous écrire »** (`plan-nous-ecrire.md`, §2.1).
 *
 * Pas un agrégat à transitions : un réglage (CLAUDE.md §3.1, « CRUD
 * honnête »). Ce que la classe garantit, c'est la VALIDITÉ — un libellé
 * français, une adresse de destination valide, un rang entier — à la création
 * comme à la révision, et l'archivage plutôt que la suppression.
 */
export class ContactSubject {
  private constructor(private state: ContactSubjectState) {}

  static create(
    input: ContactSubjectSettings & { readonly id: string; readonly at: Date },
  ): ContactSubject {
    return new ContactSubject({
      ...validated(input),
      id: input.id,
      archivedAt: null,
      createdAt: input.at,
      updatedAt: input.at,
    });
  }

  /** Réhydrate depuis la base : les valeurs-objets revalident. */
  static rehydrate(
    state: Omit<ContactSubjectState, "recipientEmail"> & { readonly recipientEmail: string },
  ): ContactSubject {
    return new ContactSubject({
      ...state,
      recipientEmail: EmailAddress.create(state.recipientEmail),
    });
  }

  /** Remplace le réglage entier ; un objet archivé se révise encore (rien ne le montre). */
  revise(settings: ContactSubjectSettings, at: Date): void {
    this.state = { ...this.state, ...validated(settings), updatedAt: at };
  }

  /** Idempotent : archiver un objet archivé ne change pas sa date. */
  archive(at: Date): void {
    if (this.state.archivedAt !== null) {
      return;
    }
    this.state = { ...this.state, archivedAt: at, updatedAt: at };
  }

  /** Proposé à ce public : actif, non archivé, et visible pour lui. */
  isOfferedTo(audience: CustomerAudience): boolean {
    const { active, archivedAt } = this.state;
    const visible = this.state.audience === "both" || this.state.audience === audience;
    return active && archivedAt === null && visible;
  }

  get id(): string {
    return this.state.id;
  }

  get labelFr(): string {
    return this.state.label.fr;
  }

  get priority(): ContactPriority {
    return this.state.priority;
  }

  get recipientEmail(): string {
    return this.state.recipientEmail.value;
  }

  toPersistence(): ContactSubjectState {
    return this.state;
  }
}

function validated(
  input: ContactSubjectSettings,
): Omit<ContactSubjectState, "id" | "archivedAt" | "createdAt" | "updatedAt"> {
  const label = localizedText("Libellé", input.label, CONTACT_BOUNDS.subjectLabel);
  if (label.fr === "") {
    throw new ContactSubjectLabelMissingError();
  }
  if (!Number.isInteger(input.position) || input.position < 0) {
    throw new ContactSubjectPositionInvalidError(input.position);
  }
  return {
    label,
    recipientEmail: EmailAddress.create(input.recipientEmail),
    position: input.position,
    active: input.active,
    audience: input.audience,
    priority: input.priority,
  };
}
