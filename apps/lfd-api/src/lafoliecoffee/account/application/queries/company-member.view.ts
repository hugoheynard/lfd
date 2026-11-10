import type { CompanyMemberView } from "@lfd/contracts";

import type { CompanyMemberRecord } from "../../domain/ports/company-member.repository.js";

/**
 * Enregistrement de domaine → vue.
 *
 * Écrit une fois, parce que deux endroits en ont besoin (la liste et le retour
 * d'invitation) et qu'une seconde copie divergerait au premier champ ajouté.
 */
export function toMemberView(record: CompanyMemberRecord): CompanyMemberView {
  return {
    userId: record.userId,
    email: record.email,
    firstName: record.firstName,
    lastName: record.lastName,
    phone: record.phone,
    role: record.role,
    status: record.status,
    joinedAt: record.joinedAt.toISOString(),
  };
}
