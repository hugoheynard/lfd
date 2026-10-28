import {
  CONTACT_BOUNDS,
  REQUEST_KINDS,
  SYSTEM_REQUEST_KINDS,
  type ContactAudience,
  type ContactLocalizedText,
  type CustomerAudience,
  type RequestKind,
  type RequestPriority,
} from "@lfd/contracts";

import { EmailAddress } from "../../account/domain/value-objects/email-address.js";
import { localizedText } from "./contact-text.js";
import {
  ContactPositionInvalidError,
  RequestReasonKindImmutableError,
  RequestReasonKindUnknownError,
  RequestReasonLabelMissingError,
} from "./errors/contact-errors.js";
import { SystemRequestReasonLockedError } from "./errors/email-reply-errors.js";

/** Ce que le staff règle d'un motif : tout, d'un bloc — `kind` compris, qu'il ne peut que répéter. */
export interface RequestReasonSettings {
  readonly kind: RequestKind;
  readonly label: ContactLocalizedText;
  readonly recipientEmail: string;
  readonly position: number;
  readonly active: boolean;
  readonly audience: ContactAudience;
  /** Usage interne : trie les demandes à traiter, jamais montrée à la boutique. */
  readonly priority: RequestPriority;
}

/** Le motif tel que la base le garde. */
export interface RequestReasonState extends Omit<RequestReasonSettings, "recipientEmail"> {
  readonly id: string;
  readonly recipientEmail: EmailAddress;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * **Un motif de demande** (`demandes-clients.md`, §2 et §6.5) — ce qu'un
 * formulaire propose de choisir : « Devenir client pro » pour « Nous
 * écrire », « Produit abîmé » pour « Signaler un problème ».
 *
 * Ses invariants : un TYPE connu et **immuable** — une demande reçue cite son
 * motif sous le formulaire d'où elle vient, et un motif qui changerait de
 * formulaire la ferait mentir ; un libellé français ; une adresse valide ; un
 * rang entier. Archivé, jamais supprimé.
 */
export class RequestReason {
  private constructor(private state: RequestReasonState) {}

  /**
   * @throws {RequestReasonKindUnknownError} {RequestReasonLabelMissingError} {ContactPositionInvalidError}
   * @throws {SystemRequestReasonLockedError} un type dont le motif est posé par le système.
   */
  static create(
    input: RequestReasonSettings & { readonly id: string; readonly at: Date },
  ): RequestReason {
    ensureNotSystem(input.kind);
    return new RequestReason({
      ...validated(input),
      id: input.id,
      archivedAt: null,
      createdAt: input.at,
      updatedAt: input.at,
    });
  }

  /** Réhydrate depuis la base : les valeurs-objets revalident. */
  static rehydrate(
    state: Omit<RequestReasonState, "recipientEmail"> & { readonly recipientEmail: string },
  ): RequestReason {
    return new RequestReason({
      ...state,
      kind: knownKind(state.kind),
      recipientEmail: EmailAddress.create(state.recipientEmail),
    });
  }

  /**
   * Remplace le réglage entier ; un motif archivé se révise encore (rien ne le montre).
   *
   * @throws {RequestReasonKindImmutableError} le réglage le range sous un autre formulaire.
   * @throws {SystemRequestReasonLockedError} un motif posé par le système.
   */
  revise(settings: RequestReasonSettings, at: Date): void {
    ensureNotSystem(this.state.kind);
    if (settings.kind !== this.state.kind) {
      throw new RequestReasonKindImmutableError(this.state.id);
    }
    this.state = { ...this.state, ...validated(settings), updatedAt: at };
  }

  /**
   * Idempotent : archiver un motif archivé ne change pas sa date.
   * @throws {SystemRequestReasonLockedError} un motif posé par le système.
   */
  archive(at: Date): void {
    ensureNotSystem(this.state.kind);
    if (this.state.archivedAt !== null) {
      return;
    }
    this.state = { ...this.state, archivedAt: at, updatedAt: at };
  }

  /** Proposé par CE formulaire à CE public : du bon type, actif, non archivé, visible pour lui. */
  isOfferedFor(kind: RequestKind, audience: CustomerAudience): boolean {
    const { active, archivedAt } = this.state;
    const visible = this.state.audience === "both" || this.state.audience === audience;
    return this.state.kind === kind && active && archivedAt === null && visible;
  }

  get id(): string {
    return this.state.id;
  }

  get kind(): RequestKind {
    return this.state.kind;
  }

  get labelFr(): string {
    return this.state.label.fr;
  }

  get priority(): RequestPriority {
    return this.state.priority;
  }

  get recipientEmail(): string {
    return this.state.recipientEmail.value;
  }

  toPersistence(): RequestReasonState {
    return this.state;
  }
}

/** Le motif d'un type système est posé par la migration, jamais à l'écran. */
function ensureNotSystem(kind: RequestKind): void {
  if (SYSTEM_REQUEST_KINDS.includes(kind)) {
    throw new SystemRequestReasonLockedError();
  }
}

function knownKind(kind: string): RequestKind {
  const known = REQUEST_KINDS.find((candidate) => candidate === kind);
  if (known === undefined) {
    throw new RequestReasonKindUnknownError(kind);
  }
  return known;
}

function validated(
  input: RequestReasonSettings,
): Omit<RequestReasonState, "id" | "archivedAt" | "createdAt" | "updatedAt"> {
  const kind = knownKind(input.kind);
  const label = localizedText("Libellé", input.label, CONTACT_BOUNDS.reasonLabel);
  if (label.fr === "") {
    throw new RequestReasonLabelMissingError();
  }
  if (!Number.isInteger(input.position) || input.position < 0) {
    throw new ContactPositionInvalidError(input.position);
  }
  return {
    kind,
    label,
    recipientEmail: EmailAddress.create(input.recipientEmail),
    position: input.position,
    active: input.active,
    audience: input.audience,
    priority: input.priority,
  };
}
