import { CONTACT_BOUNDS, type ContactPriority, type CustomerAudience } from "@lfd/contracts";

import type { StaffTrace } from "../../account/domain/value-objects/staff-trace.js";
import { EmailAddress } from "../../account/domain/value-objects/email-address.js";
import { boundedText } from "./contact-text.js";
import {
  ContactMessageAlreadyHandledError,
  ContactMessageIncompleteError,
} from "./errors/contact-errors.js";

/** Qui écrit : saisi par le visiteur, pré-rempli pour un client connecté. */
export interface ContactAuthor {
  readonly name: string;
  readonly email: string;
  /** Vide quand il ne l'a pas donné. */
  readonly phone: string;
}

/** Le traitement d'un message : quand, et par qui (figé). */
export interface ContactMessageHandling {
  readonly at: Date;
  readonly by: StaffTrace;
}

/** Le message tel que la base le garde. */
export interface ContactMessageState {
  readonly id: string;
  readonly subjectId: string;
  readonly subjectLabel: string;
  /** La priorité de l'objet, figée à la réception. */
  readonly priority: ContactPriority;
  readonly audience: CustomerAudience;
  readonly author: ContactAuthor;
  readonly body: string;
  readonly userId: string | null;
  readonly companyId: string | null;
  readonly receivedAt: Date;
  readonly handling: ContactMessageHandling | null;
  readonly anonymizedAt: Date | null;
}

/** Ce qu'il faut pour recevoir un message. */
export interface ContactMessageReception {
  readonly id: string;
  readonly subject: {
    readonly id: string;
    readonly labelFr: string;
    readonly priority: ContactPriority;
  };
  readonly audience: CustomerAudience;
  readonly author: ContactAuthor;
  readonly body: string;
  readonly userId: string | null;
  readonly companyId: string | null;
  readonly at: Date;
}

/**
 * **Un message « Nous écrire »** — l'agrégat (`nous-contacter.md`, §5.7).
 *
 * Son invariant : un message se traite **une fois**. Le second traitement est
 * refusé en le nommant, sans quoi la trace dirait deux auteurs pour un même
 * geste. Il refuse aussi, à la réception, un message sans nom, sans texte ou
 * à l'adresse invalide : l'équipe ne saurait ni à qui ni quoi répondre.
 */
export class ContactMessage {
  private constructor(private state: ContactMessageState) {}

  static receive(input: ContactMessageReception): ContactMessage {
    const name = boundedText("Nom", input.author.name, CONTACT_BOUNDS.authorName);
    const body = boundedText("Message", input.body, CONTACT_BOUNDS.message);
    if (name === "") {
      throw new ContactMessageIncompleteError("name");
    }
    if (body === "") {
      throw new ContactMessageIncompleteError("message");
    }
    return new ContactMessage({
      id: input.id,
      subjectId: input.subject.id,
      subjectLabel: input.subject.labelFr,
      priority: input.subject.priority,
      audience: input.audience,
      author: {
        name,
        email: EmailAddress.create(input.author.email).value,
        phone: boundedText("Téléphone", input.author.phone, CONTACT_BOUNDS.authorPhone),
      },
      body,
      userId: input.userId,
      companyId: input.companyId,
      receivedAt: input.at,
      handling: null,
      anonymizedAt: null,
    });
  }

  /** Réhydrate depuis la base. Un message anonymisé a ses champs vides : pas de revalidation. */
  static rehydrate(state: ContactMessageState): ContactMessage {
    return new ContactMessage(state);
  }

  /**
   * Marque le message traité.
   *
   * @throws {ContactMessageAlreadyHandledError} il l'est déjà.
   */
  markHandled(by: StaffTrace, at: Date): void {
    if (this.state.handling !== null) {
      throw new ContactMessageAlreadyHandledError(this.state.id, this.state.handling.by.name);
    }
    this.state = { ...this.state, handling: { at, by } };
  }

  get id(): string {
    return this.state.id;
  }

  get subjectLabel(): string {
    return this.state.subjectLabel;
  }

  get author(): ContactAuthor {
    return this.state.author;
  }

  toPersistence(): ContactMessageState {
    return this.state;
  }
}
