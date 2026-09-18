import {
  STAFF_ROLE_LABELS,
  type StaffOverride,
  type StaffRole,
  type StaffStatus,
} from "@lfd/contracts";

import type { JournalFact } from "../../../platform/journal/journal-fact.js";
import { grantEntry, type StaffGrantEntry } from "../../permissions/domain/staff-role-facts.js";
import { isEmptyOverrideDiff } from "./override-diff.js";
import type { StaffUserEdit } from "./staff-user-state.js";

/**
 * Les **faits de l'annuaire** — ce que le journal retient des gestes posés sur
 * une fiche de l'équipe. Sur le modèle d'`ACCOUNT_FACTS`.
 *
 * Plan : `documentation/staff/journalisation-staff/architecture-journal-de-l-annuaire.md` §5 bis,
 * qui est le contrat entre ce fichier et l'écran Journal.
 *
 * Deux règles tiennent toute la forme des charges utiles :
 *
 * - **des libellés figés**, jamais des clés seules : une fiche supprimée ou un
 *   rôle renommé ne doit pas changer la phrase d'hier ;
 * - **pas de lien**, et pas d'e-mail **hors d'une édition** (D5) : le journal
 *   est derrière `activity`, l'annuaire derrière `staff_access`. La phrase
 *   nomme les gens par leur nom.
 *
 * ⚠️ **Une édition d'identité porte l'avant/après, e-mail compris** — décidé
 * par Hugo le 2026-09-18 (« c'est important qu'on ait la trace complète sur
 * les events ») : `changes` fige chaque champ modifié avec sa valeur d'avant et
 * d'après, telles qu'écrites en base. C'est une entorse assumée à D5 : un
 * détenteur d'`activity` sans `staff_access` lit désormais l'ancienne et la
 * nouvelle adresse d'une personne dont l'e-mail a changé. Les invitations, les
 * liens et les autres faits restent sans adresse.
 *
 * L'acteur n'y figure pas : la ligne de journal le fige déjà (nom, fonction).
 */
export const STAFF_FACTS = {
  created: "staff_user.created",
  /** Invitation OU nouveau lien de mot de passe — `kind` dit lequel. */
  invited: "staff_user.invited",
  /** Un lien fabriqué pour être remis à la main — il n'est PAS dans la trace. */
  passwordLinkIssued: "staff_user.password_link_issued",
  identityEdited: "staff_user.identity_edited",
  roleChanged: "staff_user.role_changed",
  overridesChanged: "staff_user.overrides_changed",
  suspended: "staff_user.suspended",
  reinstated: "staff_user.reinstated",
  deleted: "staff_user.deleted",
} as const;

const STAFF_USER_SUBJECT = "staff_user";

/** Une personne, nommée — sans adresse (D5). */
export type StaffPerson = { readonly firstName: string; readonly lastName: string };

/** Une dérogation telle que la trace la fige. */
export type StaffOverrideEntry = StaffGrantEntry & { readonly effect: StaffOverride["effect"] };

/** Ce qu'un lien envoyé était : une première invitation, ou un mot de passe perdu. */
export type StaffInvitationKind = "invitation" | "password_reset";

/**
 * Les champs d'identité, en **libellés** : ce que la phrase affiche (« a
 * modifié la fiche de Cécile Martin : téléphone, fonction »). Des valeurs de
 * donnée, pas des noms — elles restent en français.
 */
const IDENTITY_FIELDS = ["firstName", "lastName", "email", "phone", "jobTitle"] as const;

/** La clé d'un champ d'identité — une colonne de la fiche. */
export type StaffIdentityField = (typeof IDENTITY_FIELDS)[number];

const IDENTITY_FIELD_LABELS: Readonly<Record<StaffIdentityField, string>> = {
  firstName: "prénom",
  lastName: "nom",
  email: "e-mail",
  phone: "téléphone",
  jobTitle: "fonction",
};

/** Un champ d'identité modifié : sa clé, son libellé figé, et l'avant/après écrit en base. */
export type StaffIdentityChange = {
  readonly field: StaffIdentityField;
  readonly label: string;
  readonly from: string;
  readonly to: string;
};

export function personOf(identity: StaffPerson): StaffPerson {
  return { firstName: identity.firstName, lastName: identity.lastName };
}

/** Ce qu'il faut pour nommer une fiche ET son rôle — une charge d'API y suffit. */
export type StaffPersonWithRole = StaffPerson & { readonly role: StaffRole };

export function staffUserCreatedFact(id: string, created: StaffPersonWithRole): JournalFact {
  return fact(STAFF_FACTS.created, id, {
    person: personOf(created),
    roleLabel: STAFF_ROLE_LABELS[created.role],
  });
}

export function staffUserInvitedFact(
  id: string,
  person: StaffPerson,
  kind: StaffInvitationKind,
): JournalFact {
  return fact(STAFF_FACTS.invited, id, { person: personOf(person), kind });
}

export function staffPasswordLinkIssuedFact(id: string, person: StaffPerson): JournalFact {
  return fact(STAFF_FACTS.passwordLinkIssued, id, { person: personOf(person) });
}

export function staffUserDeletedFact(id: string, deleted: StaffPersonWithRole): JournalFact {
  return fact(STAFF_FACTS.deleted, id, {
    person: personOf(deleted),
    roleLabel: STAFF_ROLE_LABELS[deleted.role],
  });
}

/**
 * La suspension ou la réintégration, ou `null` si l'état ne bouge pas —
 * suspendre quelqu'un de déjà suspendu n'est pas un fait.
 *
 * ⚠️ Tout passage vers `active` s'écrit `reinstated`, y compris depuis
 * `pending` ou `invited` : la route le permet, et le plan ne nomme pas d'autre
 * fait pour ce cas (remonté le 2026-09-18).
 */
export function staffStatusFact(
  id: string,
  person: StaffPerson,
  from: StaffStatus,
  to: "active" | "suspended",
): JournalFact | null {
  if (from === to) {
    return null;
  }
  const type = to === "suspended" ? STAFF_FACTS.suspended : STAFF_FACTS.reinstated;
  return fact(type, id, { person: personOf(person) });
}

/**
 * Les faits d'une édition — **un par changement réel**, aucun pour une édition
 * vide. Identité, rôle et dérogations ont chacun le leur : la clé
 * d'idempotence du journal (`type:subjectId:traceId`) les distingue par leur
 * type.
 */
export function staffUserEditFacts(id: string, edit: StaffUserEdit): readonly JournalFact[] {
  const person = personOf(edit.after);
  return [
    identityEditedFact(id, edit, person),
    roleChangedFact(id, edit.before.role, edit.after.role, person),
    overridesChangedFact(id, edit, person),
  ].filter((entry): entry is JournalFact => entry !== null);
}

function identityEditedFact(
  id: string,
  edit: StaffUserEdit,
  person: StaffPerson,
): JournalFact | null {
  const fields = IDENTITY_FIELDS.filter((field) => edit.before[field] !== edit.after[field]);
  if (fields.length === 0) {
    return null;
  }
  const renamed =
    edit.before.firstName !== edit.after.firstName || edit.before.lastName !== edit.after.lastName;
  return fact(STAFF_FACTS.identityEdited, id, {
    person,
    previous: renamed ? personOf(edit.before) : null,
    // `fields` et `previous` restent : les faits déjà écrits les portent, et
    // `staff-line.ts` (écran Journal) les lit (vérifié le 2026-09-18).
    fields: fields.map((field) => IDENTITY_FIELD_LABELS[field]),
    changes: fields.map((field): StaffIdentityChange => ({
      field,
      label: IDENTITY_FIELD_LABELS[field],
      from: edit.before[field],
      to: edit.after[field],
    })),
  });
}

function roleChangedFact(
  id: string,
  from: StaffRole,
  to: StaffRole,
  person: StaffPerson,
): JournalFact | null {
  return from === to
    ? null
    : fact(STAFF_FACTS.roleChanged, id, {
        person,
        fromLabel: STAFF_ROLE_LABELS[from],
        toLabel: STAFF_ROLE_LABELS[to],
      });
}

function overridesChangedFact(
  id: string,
  edit: StaffUserEdit,
  person: StaffPerson,
): JournalFact | null {
  if (isEmptyOverrideDiff(edit.overrides)) {
    return null;
  }
  return fact(STAFF_FACTS.overridesChanged, id, {
    person,
    added: edit.overrides.added.map(overrideEntry),
    removed: edit.overrides.removed.map(overrideEntry),
    changed: edit.overrides.changed.map(overrideEntry),
  });
}

function overrideEntry(override: StaffOverride): StaffOverrideEntry {
  return { ...grantEntry(override.resource, override.action), effect: override.effect };
}

function fact(type: string, id: string, payload: Record<string, unknown>): JournalFact {
  return { type, subjectType: STAFF_USER_SUBJECT, subjectId: id, payload };
}
