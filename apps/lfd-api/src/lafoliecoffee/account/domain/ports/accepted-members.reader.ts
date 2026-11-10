import type { CompanyRole } from "../value-objects/company-role.js";

/** Une personne ENTRÉE dans la société, et le rôle qu'elle y tient. */
export interface AcceptedMember {
  readonly userId: string;
  readonly email: string;
  readonly role: CompanyRole;
}

/**
 * **Les membres acceptés d'une société, par rôle**
 * (`plan-notifications-sous-comptes.md`, §2, §3).
 *
 * « Accepté » = `acceptedAt` non nul : une invitation pendante ou périmée est
 * une adresse saisie, pas une personne connue, et on ne lui écrit pas au nom
 * d'une autre société. Port de lecture à part (ISP) : l'abonné des avis au
 * principal n'a besoin que de cette question.
 */
export abstract class AcceptedMembersReader {
  /** Les membres acceptés de `companyId` dont le rôle est dans `roles` ; `[]` si `roles` est vide. */
  abstract withRoles(
    companyId: string,
    roles: readonly CompanyRole[],
  ): Promise<readonly AcceptedMember[]>;
}
