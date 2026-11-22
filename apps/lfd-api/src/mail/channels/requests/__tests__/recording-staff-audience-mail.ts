import type { DeferrableMailTemplate, MailRequested, MailSubject } from "../mail.js";
import { type StaffAudienceMailDemand, StaffAudienceMail } from "../staff-audience-mail.js";
import type { OpenableUnitOfWork } from "./recording-mail.js";
import { MisplacedMailRequestError } from "./recording-mail.js";

/** Une demande « à l'équipe » telle que le double l'a reçue. */
export interface RecordedStaffAudienceMail {
  readonly template: string;
  readonly data: unknown;
  readonly idempotencyKey: string;
  readonly subjects?: readonly MailSubject[];
}

/**
 * **L'envoi « à l'équipe », doublé** pour un bloc qui avise l'équipe : il
 * range la demande sans choisir de destinataire — c'est le travail du bloc
 * `mail`, éprouvé chez lui. Comme {@link RecordingMail}, refuse un appel hors
 * de l'unité de travail quand on lui en donne une.
 */
export class RecordingStaffAudienceMail extends StaffAudienceMail {
  readonly queued: RecordedStaffAudienceMail[] = [];

  constructor(private readonly unitOfWork: OpenableUnitOfWork | null = null) {
    super();
  }

  sendToStaffAudience<K extends DeferrableMailTemplate>(
    demand: StaffAudienceMailDemand<K>,
  ): Promise<readonly MailRequested[]> {
    if (this.unitOfWork !== null && !this.unitOfWork.open) {
      return Promise.reject(
        new MisplacedMailRequestError(`request hors transaction (${demand.template})`),
      );
    }
    this.queued.push(demand);
    return Promise.resolve([{ requestId: `mail_${this.queued.length}` }]);
  }
}
