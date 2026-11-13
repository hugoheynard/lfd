import { Injectable } from "@nestjs/common";

import {
  MailSubjectDeliveries,
  type SubjectMail,
} from "../../../../mail/channels/deliveries/mail-subject-deliveries.js";
import { CompanyMemberReader } from "../../domain/ports/company-member.repository.js";
import type { CompanyOpened } from "../commands/create-company-by-staff.handler.js";

/**
 * Les e-mails d'accès qu'une ouverture peut avoir envoyés au détenteur
 * (`AccountAccessGranter`, vérifié le 2026-11-13 : `customer.access-opened`
 * pour une identité neuve, `customer.company-attached` pour une personne
 * déjà connue — tous deux avec le sujet `company`).
 */
const ACCESS_TEMPLATES: ReadonlySet<string> = new Set([
  "customer.access-opened",
  "customer.company-attached",
]);

/**
 * **Ce qu'une ouverture de compte a donné, relu sur l'état réel.**
 *
 * Le registre des intentions ne garde que l'identifiant de la société : il
 * est scellé dans la transaction qui l'écrit, avant que l'accès soit tenté.
 * Un rejeu de la même intention relit donc le sort du détenteur sur les
 * membres de la société, et l'e-mail sur le suivi du bloc `mail` — sans
 * rouvrir l'accès ni renvoyer l'e-mail.
 */
@Injectable()
export class CompanyOpeningReplay {
  constructor(
    private readonly members: CompanyMemberReader,
    private readonly mails: MailSubjectDeliveries,
  ) {}

  /** `withHolder` : la commande portait un contact, donc un accès à ouvrir. */
  async read(companyId: string, withHolder: boolean): Promise<CompanyOpened> {
    if (!withHolder) {
      return { id: companyId, holder: "deferred", mailSent: false };
    }
    const members = await this.members.listOf(companyId);
    if (!members.some((member) => member.role === "owner")) {
      return { id: companyId, holder: "failed", mailSent: false };
    }
    const found = await this.mails.forSubjects("company", [companyId]);
    const mailSent = (found.get(companyId) ?? []).some(isAcceptedAccessMail);
    return { id: companyId, holder: "attached", mailSent };
  }
}

/** Accepté par Resend, et pas à blanc : le `mailSent` de l'ouverture. */
function isAcceptedAccessMail(mail: SubjectMail): boolean {
  return (
    ACCESS_TEMPLATES.has(mail.template) && mail.state === "accepted" && mail.delivery !== "dry_run"
  );
}
