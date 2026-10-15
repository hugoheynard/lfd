import {
  STAFF_RESOURCE_LABELS,
  STAFF_STATUS_LABELS,
  type StaffOverride,
  type StaffPermission,
  type StaffRoleView,
  type StaffUserView,
} from '@lfd/contracts';

import { toolGroups } from '../admin/roles/resource-tools';

import type { ParsedPermission } from './access-agent-guard';

/**
 * **Les droits en texte**, pour un agent — ce que montrent Équipe → Rôles et
 * Équipe → Annuaire. Tout vient des vues servies : `permissions` y est DÉJÀ
 * résolu par le serveur (rôle et dérogations), et ce fichier ne fait que le
 * ranger et le nommer — il ne le recalcule jamais.
 */

const LEVEL_LABELS = { write: 'écriture', read: 'lecture' } as const;

/** « Commandes (écriture) » — le libellé du contrat, et le niveau. */
function grantLabel(resource: keyof typeof STAFF_RESOURCE_LABELS, level: 'write' | 'read'): string {
  return `${STAFF_RESOURCE_LABELS[resource]} [${resource}] (${LEVEL_LABELS[level]})`;
}

/**
 * Des droits résolus rangés par catégorie (celles de l'écran des rôles), une
 * ligne par catégorie : l'écriture emporte la lecture, elle se dit seule.
 */
export function groupedPermissions(permissions: readonly StaffPermission[]): readonly string[] {
  const held = new Set<string>(permissions);
  const lines = toolGroups().flatMap((group) => {
    const parts = group.resources.flatMap(({ resource }) => {
      if (held.has(`${resource}:write`)) {
        return [grantLabel(resource, 'write')];
      }
      return held.has(`${resource}:read`) ? [grantLabel(resource, 'read')] : [];
    });
    return parts.length === 0 ? [] : [`  · ${group.label} — ${parts.join(', ')}`];
  });
  return lines.length === 0 ? ['  · aucun droit'] : lines;
}

function roleState(role: StaffRoleView): string {
  if (role.locked) {
    return 'VERROUILLÉ (calculé, ni modifiable ni assignable)';
  }
  return role.archivedAt === null ? 'ACTIF' : `ARCHIVÉ le ${role.archivedAt}`;
}

/** Une ligne par rôle : clé, libellé, état, porteurs, nombre de droits. */
export function rolesListText(roles: readonly StaffRoleView[]): string {
  if (roles.length === 0) {
    return 'Aucun rôle.';
  }
  return [
    `${roles.length} rôle(s).`,
    ...roles.map(
      (role) =>
        `« ${role.label} » — clé ${role.key} — ${roleState(role)} — ${role.memberCount} personne(s) — ${role.permissions.length} droit(s) résolu(s)`,
    ),
  ].join('\n');
}

/** Un rôle, ses droits résolus par catégorie. */
export function roleText(role: StaffRoleView): string {
  return [
    `« ${role.label} » — clé ${role.key} — ${roleState(role)} — ${role.memberCount} personne(s)`,
    ...groupedPermissions(role.permissions),
  ].join('\n');
}

function personName(person: StaffUserView): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

function personLine(person: StaffUserView): string {
  const rescue = person.isRescue ? ' — FICHE DE SECOURS' : '';
  return `${personName(person)} — id ${person.id} — rôle « ${person.roleLabel} » (${person.role}) — ${STAFF_STATUS_LABELS[person.status]}${rescue}`;
}

/** L'annuaire : une ligne par personne. Ni e-mail ni téléphone : ce n'est pas la question. */
export function staffListText(people: readonly StaffUserView[]): string {
  if (people.length === 0) {
    return 'L’annuaire est vide.';
  }
  return [`${people.length} personne(s).`, ...people.map(personLine)].join('\n');
}

function overrideLine(override: StaffOverride): string {
  const effect = override.effect === 'allow' ? 'ACCORDÉ en plus du rôle' : 'REFUSÉ malgré le rôle';
  return `  · ${effect} : ${grantLabel(override.resource, override.action)}`;
}

/** Le rôle, les dérogations, et l'effectif tel que le serveur l'a résolu. */
export function accessOfText(person: StaffUserView): string {
  return [
    personLine(person),
    person.overrides.length === 0
      ? 'Dérogations : aucune.'
      : `Dérogations (${person.overrides.length}) :`,
    ...person.overrides.map(overrideLine),
    'Droits effectifs (résolus par le serveur) :',
    ...groupedPermissions(person.permissions),
  ].join('\n');
}

/**
 * Qui tient un droit : les rôles qui le donnent, puis les personnes qui le
 * tiennent EFFECTIVEMENT, chacune avec sa source — son rôle, ou une
 * dérogation quand son rôle ne le donne pas. Les personnes à qui une
 * dérogation le retire sont dites aussi. Tout se lit dans les vues servies.
 */
export function whoCanText(
  wanted: ParsedPermission,
  roles: readonly StaffRoleView[],
  people: readonly StaffUserView[],
): string {
  const { permission } = wanted;
  const givingRoles = roles.filter((role) => role.permissions.includes(permission));
  const byRole = new Set(givingRoles.map((role) => role.key));
  const holders = people.filter((person) => person.permissions.includes(permission));
  const withdrawn = people.filter(
    (person) => byRole.has(person.role) && !person.permissions.includes(permission),
  );
  const source = (person: StaffUserView): string => {
    if (person.isRescue) {
      return 'fiche de secours';
    }
    return byRole.has(person.role) ? 'par son rôle' : 'par dérogation';
  };
  return [
    `${permission} — ${grantLabel(wanted.resource, wanted.action)}`,
    givingRoles.length === 0
      ? 'Aucun rôle ne le donne.'
      : `Rôles qui le donnent : ${givingRoles.map((role) => `« ${role.label} » (${role.key})`).join(', ')}.`,
    holders.length === 0 ? 'Personne ne le tient.' : `${holders.length} personne(s) le tiennent :`,
    ...holders.map((person) => `  · ${personLine(person)} — ${source(person)}`),
    ...withdrawn.map(
      (person) => `  · RETIRÉ par dérogation malgré le rôle : ${personLine(person)}`,
    ),
  ].join('\n');
}
