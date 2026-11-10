import type { AppointmentSubjectType } from "@lfd/contracts";

import type { CompanyNamer } from "../domain/ports/company-namer.js";
import type { LeadRepository } from "../domain/ports/lead.repository.js";

/** Ce qu'il faut d'un rendez-vous pour nommer son sujet. */
export interface AppointmentSubject {
  readonly subjectType: AppointmentSubjectType;
  readonly subjectId: string;
  /** Le nom que le contact a donné en prenant rendez-vous — vide s'il n'en a pas donné. */
  readonly contactName: string;
}

/** Les ports qui nomment un sujet ; un prospect ne se nomme que si le handler en a un. */
export interface AppointmentNamers {
  readonly companies: CompanyNamer;
  readonly leads?: LeadRepository;
}

/**
 * **Le nom du sujet d'un rendez-vous**, figé dans le fait (lot B du plan
 * `documentation/journalisation/plan-phrases-du-journal.md`, D6) : l'enseigne
 * de la société, celle du prospect, sinon le nom que la personne a donné.
 *
 * Omis plutôt qu'inventé quand rien ne le dit — et jamais l'e-mail du contact,
 * qui est une coordonnée.
 */
export async function appointmentSubjectLabel(
  subject: AppointmentSubject,
  namers: AppointmentNamers,
): Promise<{ subjectLabel?: string }> {
  const name = (await nameOf(subject, namers))?.trim() ?? "";
  return name === "" ? {} : { subjectLabel: name };
}

async function nameOf(subject: AppointmentSubject, namers: AppointmentNamers) {
  if (subject.subjectType === "company") {
    return (await namers.companies.nameOf(subject.subjectId))?.enseigne ?? null;
  }
  if (subject.subjectType === "lead" && namers.leads !== undefined) {
    return (await namers.leads.load(subject.subjectId))?.businessName ?? null;
  }
  return subject.contactName;
}
