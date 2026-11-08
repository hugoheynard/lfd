import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import {
  isMailSubjectType,
  MAIL_SUBJECT_ID_MAX,
  type MailSubject,
} from "../requests/mail-subject.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const MAIL_DELIVERY_FAILED = "mail.delivery_failed";

/** Les retours qui disent « non reçu ». */
export type FailedMailDelivery = "complained" | "bounced";

const FAILED_DELIVERIES: readonly FailedMailDelivery[] = ["complained", "bounced"];

/** Ce que le fait porte — jamais l'adresse. */
export interface MailDeliveryFailedFields {
  /** L'identifiant de la fiche de suivi (`/emails/envois`), et la clé du fait. */
  readonly requestId: string;
  /** La clé du registre (`customer.order-ready`). */
  readonly template: string;
  readonly subjects: readonly MailSubject[];
  readonly delivery: FailedMailDelivery;
  /** Le genre du retour (`Permanent/Suppressed`) ; `null` quand le fournisseur n'en dit pas. */
  readonly kind: string | null;
  /** L'instant du retour chez le fournisseur. */
  readonly at: Date;
}

/**
 * **Un e-mail n'a pas été reçu** — sa demande est ENTRÉE dans l'échec
 * (`documentation/mail/plan-sujet-des-e-mails.md`, règles 4 et 5) : rebond
 * ou plainte, une fois par demande. C'est l'agrégat `MailRequest` qui le
 * décide, et le dépôt qui l'écrit à la boîte d'envoi avec la demande.
 *
 * ## Le contrat
 *
 * `{ requestId, template, subjects, delivery, kind, at }`, sans adresse : le
 * bloc `mail` ne sait pas ce qu'est une commande, il rend les sujets que la
 * demande a nommés, et chaque bloc métier reconnaît les siens.
 *
 * ## La clé
 *
 * `mail.delivery_failed:<requestId>` : une demande n'entre qu'une fois dans
 * l'échec (l'échelle ne descend pas) ; deux applications concurrentes qui la
 * croiraient chacune entrante écrivent la même clé, et la boîte d'envoi n'en
 * garde qu'une.
 *
 * ## Hors du journal d'activité
 *
 * Il n'y entre pas : le fait est une machine qui rend compte d'un tiers, la
 * fiche du suivi le montre déjà (`delivery`, `delivery_at`), et la cloche
 * qu'il fait sonner est la trace que l'équipe lit.
 *
 * 🔴 Il vit dans le CANAL : un fait qu'un autre bloc consomme fait partie de
 * la surface publiée, au même titre qu'un port.
 */
export class MailDeliveryFailedEvent implements DurableEvent {
  constructor(readonly fields: MailDeliveryFailedFields) {}

  durableFact(): DurableFact {
    const { requestId, template, subjects, delivery, kind, at } = this.fields;
    return {
      type: MAIL_DELIVERY_FAILED,
      key: `${MAIL_DELIVERY_FAILED}:${requestId}`,
      payload: {
        requestId,
        template,
        subjects: subjects.map((subject) => ({ type: subject.type, id: subject.id })),
        delivery,
        kind,
        at: at.toISOString(),
      },
    };
  }

  /**
   * Relit le contrat côté abonné. Un payload hors forme est une faute
   * d'émetteur : la livraison échoue, est reprise, puis reste en message mort.
   *
   * @throws {MailDeliveryFailedPayloadError}
   */
  static fromPayload(payload: Readonly<Record<string, unknown>>): MailDeliveryFailedEvent {
    const { requestId, template, kind, at } = payload;
    const delivery = FAILED_DELIVERIES.find((known) => known === payload["delivery"]);
    const instant = typeof at === "string" ? new Date(at) : null;
    const subjects = subjectsOf(payload["subjects"]);
    if (
      typeof requestId !== "string" ||
      typeof template !== "string" ||
      (kind !== null && typeof kind !== "string") ||
      delivery === undefined ||
      subjects === null ||
      instant === null ||
      Number.isNaN(instant.getTime())
    ) {
      throw new MailDeliveryFailedPayloadError();
    }
    return new MailDeliveryFailedEvent({
      requestId,
      template,
      subjects,
      delivery,
      kind,
      at: instant,
    });
  }
}

/** Un sujet relu du `jsonb` : un type déclaré et un identifiant non vide. */
function subjectOf(entry: unknown): MailSubject | null {
  if (typeof entry !== "object" || entry === null || !("type" in entry) || !("id" in entry)) {
    return null;
  }
  const { type, id } = entry;
  if (typeof type !== "string" || !isMailSubjectType(type) || typeof id !== "string") {
    return null;
  }
  return id.length === 0 || id.length > MAIL_SUBJECT_ID_MAX ? null : { type, id };
}

/** La liste des sujets, ou `null` si une seule entrée est illisible. */
function subjectsOf(raw: unknown): readonly MailSubject[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const subjects = raw.map(subjectOf);
  return subjects.every((subject) => subject !== null)
    ? subjects.filter((subject): subject is MailSubject => subject !== null)
    : null;
}

/** Le fait `mail.delivery_failed` reçu ne respecte pas son contrat. */
export class MailDeliveryFailedPayloadError extends TechnicalError {
  constructor() {
    super(
      "mail_delivery_failed.payload_invalid",
      "Le fait « e-mail non reçu » reçu est illisible (fiche, modèle, sujets, retour ou instant manquant) : " +
        "aucune cloche n'a sonné. Le message reste dans la boîte d'envoi ; " +
        "corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
