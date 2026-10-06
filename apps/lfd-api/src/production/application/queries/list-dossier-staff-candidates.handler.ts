import type { DossierStaffCandidateView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { ReachableStaff } from "../../../staff/directory/domain/staff-contacts.js";
import { ListDossierStaffCandidatesQuery } from "./list-dossier-staff-candidates.query.js";

/**
 * **Le personnel joignable**, pour la liste de choix de Production › Réglages
 * (plan `dossier-prod-du-jour.md`, décision 4).
 *
 * Une route à elle, sous `production_settings:read` : la liste de l'équipe
 * (`/admin/staff-users`) est sous `staff_access`, que qui règle le fournil n'a
 * pas à tenir (vérifié le 2026-10-06). Elle ne rend que ce que le choix
 * demande — ni rôle, ni statut, ni téléphone.
 */
@QueryHandler(ListDossierStaffCandidatesQuery)
export class ListDossierStaffCandidatesHandler implements IQueryHandler<
  ListDossierStaffCandidatesQuery,
  readonly DossierStaffCandidateView[]
> {
  constructor(private readonly staff: ReachableStaff) {}

  async execute(): Promise<readonly DossierStaffCandidateView[]> {
    const contacts = await this.staff.list();
    return contacts.map((contact) => ({
      staffUserId: contact.staffUserId,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      jobTitle: contact.jobTitle === "" ? null : contact.jobTitle,
    }));
  }
}
