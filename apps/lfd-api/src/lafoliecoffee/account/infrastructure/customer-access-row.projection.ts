import type { CustomerAccessRowView, CustomerAccessState } from "@lfd/contracts";

import type { UserStatus } from "../../../platform/database/client/client.js";
import { accessKey, personAccessState, type AccessRow } from "./company-contacts.projection.js";

type MembershipRow = {
  readonly invitedAt: Date;
  readonly acceptedAt: Date | null;
  readonly user: {
    readonly email: string;
    readonly status: UserStatus;
    readonly emailVerified: boolean;
    readonly firstLoginAt: Date | null;
  };
};

/** Ce qui désigne un détenteur : le contact aplati et les rattachements où chercher son accès. */
interface HolderSource {
  readonly contactPrenom: string;
  readonly contactNom: string;
  readonly contactEmail: string;
  readonly contactTelephone: string;
  readonly memberships: readonly MembershipRow[];
}

/** Une société telle que la lecture la ramène, sans type Prisma. */
export interface CustomerAccessCompanyRow extends HolderSource {
  readonly id: string;
  readonly enseigne: string;
  readonly raisonSociale: string;
  readonly parentCompany:
    | (HolderSource & {
        readonly id: string;
        readonly enseigne: string;
        readonly raisonSociale: string;
      })
    | null;
  /** Les principaux dont le sous-compte suit EN CE MOMENT les contacts (`validTo: null`). */
  readonly contactsFollowedFrom: readonly string[];
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
 *
 * Un sous-compte qui suit les contacts de son principal, ou qui n'a pas de
 * contact propre, montre le détenteur DU PRINCIPAL, lu sur les rattachements
 * du principal (sous-comptes §2.1 : « un contact du principal partagé avec le
 * sous-compte » ; le principal agit sur ses sites). Bug du 2026-10-23 : un site
 * sans contact propre s'affichait « sans détenteur ».
 */
export function toCustomerAccessRow(
  row: CustomerAccessCompanyRow,
  now: Date,
): CustomerAccessRowView {
  const inheritFrom = inheritedSource(row);
  const source: HolderSource = inheritFrom ?? row;
  const holderKey = accessKey(source.contactEmail);
  const holderAccess =
    holderKey === ""
      ? undefined
      : peopleOf(source).find((person) => accessKey(person.email) === holderKey);
  const others = peopleOf(row).filter(
    (person) => holderKey === "" || accessKey(person.email) !== holderKey,
  );
  return {
    companyId: row.id,
    companyName: nameOf(row),
    parent:
      row.parentCompany === null
        ? null
        : { companyId: row.parentCompany.id, companyName: nameOf(row.parentCompany) },
    holder: holderKey === "" ? null : holderView(source),
    holderInheritedFrom:
      inheritFrom === null ? null : { companyId: inheritFrom.id, companyName: nameOf(inheritFrom) },
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

/** Le principal dont on montre le détenteur, ou `null` si le site garde le sien. */
function inheritedSource(row: CustomerAccessCompanyRow): CustomerAccessCompanyRow["parentCompany"] {
  const parent = row.parentCompany;
  if (parent === null) {
    return null;
  }
  const follows = row.contactsFollowedFrom.includes(parent.id);
  const ownless = accessKey(row.contactEmail) === "" && accessKey(parent.contactEmail) !== "";
  return follows || ownless ? parent : null;
}

function peopleOf(source: HolderSource): readonly PersonRow[] {
  return source.memberships.map((membership) => ({
    ...membership.user,
    invitedAt: membership.invitedAt,
    acceptedAt: membership.acceptedAt,
  }));
}

function holderView(source: HolderSource): CustomerAccessRowView["holder"] {
  return {
    firstName: source.contactPrenom,
    lastName: source.contactNom,
    email: source.contactEmail,
    phone: source.contactTelephone,
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
