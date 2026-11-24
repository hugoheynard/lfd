import type { DeferrableMailTemplate, MailRequested, MailSubject } from "../mail.js";
import { type StaffMemberMailDemand, StaffMemberMail } from "../staff-member-mail.js";
import type { OpenableUnitOfWork } from "./recording-mail.js";
import { MisplacedMailRequestError } from "./recording-mail.js";

/** Une demande « à un membre » telle que le double l'a reçue. */
export interface RecordedStaffMemberMail {
  readonly staffUserId: string;
  readonly template: string;
  readonly data: unknown;
  readonly idempotencyKey: string;
  readonly subjects?: readonly MailSubject[];
}

/**
 * **L'envoi « à un membre », doublé** pour un bloc qui écrit à une fiche du
 * staff : il range la demande sans résoudre d'adresse — c'est le travail du
 * bloc `mail`, éprouvé chez lui. `failWith` fait échouer le prochain appel
 * (un membre inconnu ou suspendu). Refuse un appel hors de l'unité de
 * travail quand on lui en donne une.
 */
export class RecordingStaffMemberMail extends StaffMemberMail {
  readonly queued: RecordedStaffMemberMail[] = [];
  failWith: Error | null = null;

  constructor(private readonly unitOfWork: OpenableUnitOfWork | null = null) {
    super();
  }

  sendToStaffMember<K extends DeferrableMailTemplate>(
    demand: StaffMemberMailDemand<K>,
  ): Promise<MailRequested> {
    if (this.unitOfWork !== null && !this.unitOfWork.open) {
      return Promise.reject(
        new MisplacedMailRequestError(`request hors transaction (${demand.template})`),
      );
    }
    const failure = this.failWith;
    this.failWith = null;
    if (failure !== null) {
      return Promise.reject(failure);
    }
    this.queued.push(demand);
    return Promise.resolve({ requestId: `mail_${this.queued.length}` });
  }
}
