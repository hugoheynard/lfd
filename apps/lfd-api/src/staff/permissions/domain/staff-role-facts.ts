import {
  STAFF_RESOURCE_LABELS,
  type RoleGrant,
  type StaffAction,
  type StaffResource,
} from "@lfd/contracts";

import type { JournalFact } from "../../../platform/journal/journal-fact.js";
import type { StaffRoleSnapshot } from "./staff-role-definition.js";

/**
 * Les **faits des rôles** — ce que le journal retient de leur définition.
 *
 * Plan : `documentation/staff/journalisation-staff/architecture-journal-de-l-annuaire.md` §5 bis.
 * Préfixe `staff_role.` : le journal range un fait dans son module par son
 * préfixe (`growth/domain/activity-module.ts`), ici le module `equipe`.
 *
 * La charge utile fige des **libellés**, jamais des clés seules : un rôle
 * renommé demain ne doit pas changer la phrase d'hier. Le libellé du rôle est
 * celui **en base** — « Logistique » n'existe pas dans le contrat.
 */
export const STAFF_ROLE_FACTS = {
  created: "staff_role.created",
  updated: "staff_role.updated",
  archived: "staff_role.archived",
  restored: "staff_role.restored",
} as const;

/** Le sujet d'un fait de rôle : sa clé, immuable. */
const ROLE_SUBJECT = "staff_role";

/** Un droit tel que la trace le fige : la clé ET son libellé du jour. */
export type StaffGrantEntry = {
  readonly resource: StaffResource;
  readonly resourceLabel: string;
  readonly action: StaffAction;
};

/** Pose le libellé du contrat sur un couple (ressource, action). */
export function grantEntry(resource: StaffResource, action: StaffAction): StaffGrantEntry {
  return { resource, resourceLabel: STAFF_RESOURCE_LABELS[resource], action };
}

export function roleCreatedFact(role: StaffRoleSnapshot): JournalFact {
  return fact(STAFF_ROLE_FACTS.created, role.key, {
    label: role.label,
    grants: role.grants.map((grant) => grantEntry(grant.resource, grant.action)),
  });
}

/**
 * Ce qu'une redéfinition a changé, ou `null` si elle n'a rien changé — une
 * édition vide n'écrit rien au journal.
 *
 * `changed` porte le **nouveau** niveau.
 */
export function roleUpdatedFact(
  before: StaffRoleSnapshot,
  after: StaffRoleSnapshot,
): JournalFact | null {
  const previous = byResource(before.grants);
  const next = byResource(after.grants);
  const added = after.grants.filter((grant) => !previous.has(grant.resource));
  const removed = before.grants.filter((grant) => !next.has(grant.resource));
  const changed = after.grants.filter((grant) => {
    const was = previous.get(grant.resource);
    return was !== undefined && was !== grant.action;
  });
  const relabelled = before.label !== after.label;
  if (!relabelled && added.length + removed.length + changed.length === 0) {
    return null;
  }
  return fact(STAFF_ROLE_FACTS.updated, after.key, {
    label: after.label,
    previousLabel: relabelled ? before.label : null,
    added: added.map(toEntry),
    removed: removed.map(toEntry),
    changed: changed.map(toEntry),
  });
}

/** L'archivage, ou `null` s'il l'était déjà : pas de fait sans changement réel. */
export function roleArchivedFact(before: StaffRoleSnapshot): JournalFact | null {
  return before.archivedAt === null
    ? fact(STAFF_ROLE_FACTS.archived, before.key, { label: before.label })
    : null;
}

/** La remise en circulation, ou `null` si le rôle n'était pas archivé. */
export function roleRestoredFact(before: StaffRoleSnapshot): JournalFact | null {
  return before.archivedAt === null
    ? null
    : fact(STAFF_ROLE_FACTS.restored, before.key, { label: before.label });
}

function toEntry(grant: RoleGrant): StaffGrantEntry {
  return grantEntry(grant.resource, grant.action);
}

function byResource(grants: readonly RoleGrant[]): ReadonlyMap<StaffResource, StaffAction> {
  return new Map(grants.map((grant) => [grant.resource, grant.action]));
}

function fact(type: string, key: string, payload: Record<string, unknown>): JournalFact {
  return { type, subjectType: ROLE_SUBJECT, subjectId: key, payload };
}
