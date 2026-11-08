import {
  DELIVERY_KIND_MAX,
  type MailDelivery,
  type MailDeliveryReport,
} from "../../../requests/domain/value-objects/mail-delivery.js";
import { InvalidMailDeliveryEventError } from "../errors/mail-delivery-event.errors.js";

const SVIX_ID_MAX = 200;
const PROVIDER_ID_MAX = 200;

/** Ce que le webhook a lu d'un retour, et quand il l'a reçu. */
export interface MailDeliveryEventDraft {
  readonly id: string;
  readonly svixId: string;
  readonly providerId: string;
  readonly delivery: MailDelivery;
  readonly kind: string | null;
  readonly occurredAt: Date;
  readonly receivedAt: Date;
}

export type MailDeliveryEventSnapshot = MailDeliveryEventDraft;

function required(field: string, value: string, max: number): string {
  if (value.length === 0 || value.length > max) {
    throw new InvalidMailDeliveryEventError(field);
  }
  return value;
}

/**
 * **Un retour du fournisseur, rangé avant d'être appliqué** (plan
 * `documentation/mail/le-suivi-des-e-mails.md`, décision 2). Immuable : un
 * retour reçu ne change plus, il s'applique ou se purge. Le `svixId` le rend
 * unique — un rejeu de Svix ne range pas deux fois — et le genre (`kind`)
 * est le seul mot du fournisseur qu'il garde (décision 4).
 */
export class MailDeliveryEvent {
  private constructor(private readonly state: MailDeliveryEventSnapshot) {}

  /** @throws {InvalidMailDeliveryEventError} un identifiant vide ou trop long, un genre trop long. */
  static receive(draft: MailDeliveryEventDraft): MailDeliveryEvent {
    if (draft.kind !== null && draft.kind.length > DELIVERY_KIND_MAX) {
      throw new InvalidMailDeliveryEventError("le genre du retour");
    }
    return new MailDeliveryEvent({
      ...draft,
      svixId: required("l'identifiant Svix", draft.svixId, SVIX_ID_MAX),
      providerId: required("l'identifiant Resend", draft.providerId, PROVIDER_ID_MAX),
    });
  }

  get providerId(): string {
    return this.state.providerId;
  }

  /** Ce qu'une demande applique. */
  report(): MailDeliveryReport {
    return { delivery: this.state.delivery, kind: this.state.kind, at: this.state.occurredAt };
  }

  snapshot(): MailDeliveryEventSnapshot {
    return this.state;
  }
}
