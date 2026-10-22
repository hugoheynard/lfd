import type { CustomerAccessRowView, CustomerAccessState } from "@lfd/contracts";

import type { UserStatus } from "../../../platform/database/client/client.js";
import { accessKey, personAccessState, type AccessRow } from "./company-contacts.projection.js";

/** Une société telle que la lecture la ramène, sans type Prisma. */
export interface CustomerAccessCompanyRow {
  readonly id: string;
  readonly enseigne: string;
  readonly raisonSociale: string;
  readonly contactPrenom: string;
  readonly contactNom: string;
  readonly contactEmail: string;
  readonly contactTelephone: string;
  readonly parentCompany: {
    readonly id: string;
    readonly enseigne: string;
    readonly raisonSociale: string;
  } | null;
  readonly memberships: readonly {
    readonly invitedAt: Date;
    readonly acceptedAt: Date | null;
    readonly user: {
      readonly email: string;
      readonly status: UserStatus;
      readonly emailVerified: boolean;
      readonly firstLoginAt: Date | null;
    };
  }[];
}

/** Un rattachement et sa personne, première connexion comprise. */
interface PersonRow extends AccessRow {
  readonly firstLoginAt: Date | null;
}

/**
 * Une ligne de la page « Accès clients ».
 *
 * Le détenteur est celui de la fiche — l'adresse aplatie sur la société — et
 * son accès se retrouve parmi les rattachements par l'adresse normalisée,
 * exactement comme `projectContacts` : deux rapprochements différents feraient
 * dire deux choses à la fiche et à la table pour la même personne. L'état, lui,
 * vient de `personAccessState`, la même règle d'échéance que l'entrée.
 */
export function toCustomerAccessRow(
  row: CustomerAccessCompanyRow,
  now: Date,
): CustomerAccessRowView {
  const access: readonly PersonRow[] = row.memberships.map((membership) => ({
    ...membership.user,
    invitedAt: membership.invitedAt,
    acceptedAt: membership.acceptedAt,
  }));
  const holderKey = accessKey(row.contactEmail);
  const holderAccess =
    holderKey === "" ? undefined : access.find((person) => accessKey(person.email) === holderKey);
  const others = access.filter((person) => person !== holderAccess);
  return {
    companyId: row.id,
    companyName: nameOf(row),
    parent:
      row.parentCompany === null
        ? null
        : { companyId: row.parentCompany.id, companyName: nameOf(row.parentCompany) },
    holder:
      holderKey === ""
        ? null
        : {
            firstName: row.contactPrenom,
            lastName: row.contactNom,
            email: row.contactEmail,
            phone: row.contactTelephone,
          },
    state: holderState(holderKey, holderAccess, now),
    // La première connexion de la PERSONNE (`users.first_login_at`), pas
    // l'acceptation de ce rattachement : c'est ce qu'on demande à la page.
    // `null` sur un compte entré avant le 2026-10-22 — « date inconnue ».
    activatedAt: holderAccess?.firstLoginAt?.toISOString() ?? null,
    lastInvitedAt: holderAccess?.invitedAt.toISOString() ?? null,
    otherMembers: others.length,
    otherMembersActive: others.filter((person) => personAccessState(person, now) === "active")
      .length,
  };
}

function holderState(
  holderKey: string,
  holderAccess: AccessRow | undefined,
  now: Date,
): CustomerAccessState {
  if (holderKey === "") {
    return "no_holder";
  }
  return holderAccess === undefined ? "none" : personAccessState(holderAccess, now);
}

/** Le nom d'usage : celui sous lequel le commercial reconnaît la société au téléphone. */
function nameOf(company: { readonly enseigne: string; readonly raisonSociale: string }): string {
  return company.enseigne.trim() === "" ? company.raisonSociale : company.enseigne;
}
