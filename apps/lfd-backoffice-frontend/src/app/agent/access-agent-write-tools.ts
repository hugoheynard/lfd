import { declareExperimentalWebMcpTool } from '@angular/core';
import type {
  StaffMeView,
  StaffRoleView,
  StaffUserView,
  UpdateStaffUserPayload,
} from '@lfd/contracts';

import type { StaffRolesService } from '../admin/roles/staff-roles.service';
import type { StaffUsersService } from '../admin/staff-users/staff-users.service';

import { withGrant, withoutGrant, type GrantChange } from './access-agent-grants';
import {
  parsePermission,
  permissionRefusal,
  personRefusal,
  roleRefusal,
  type ParsedPermission,
} from './access-agent-guard';
import { accessOfText, roleText } from './access-agent-text';
import { said } from './agent-tool-text';

/**
 * Le délai honnête : le cache d'accès n'est vidé que sur l'instance qui a
 * écrit, les autres le gardent jusqu'à expiration (`update-staff-role.handler.ts`,
 * lu le 2026-10-15).
 */
const EFFECTIVE_WITHIN =
  'Effectif partout sous 30 secondes (le cache d’accès des autres instances expire d’ici là).';

/** Ce dont les outils d'écriture ont besoin — injecté par la déclaration. */
export interface AccessWriteDeps {
  readonly rolesApi: Pick<StaffRolesService, 'list' | 'update'>;
  readonly staffApi: Pick<StaffUsersService, 'list' | 'update'>;
  /** La personne connectée, relue à chaque appel : la garde « soi-même » en dépend. */
  readonly me: () => StaffMeView | null;
}

const ROLE_INPUT = {
  type: 'object',
  properties: { key: { type: 'string' }, permission: { type: 'string' } },
  required: ['key', 'permission'],
  additionalProperties: false,
} as const;

const GUARD_HELP =
  'Refusé, avec la raison et sans rien écrire : tout droit staff_access:*, les rôles superadmin et admin, un rôle qui ouvre la gestion des droits, et votre propre rôle.';

/**
 * **Les trois écritures des droits**, et leur garde (plan
 * `plan-outils-agent-droits.md`, A3, A4, corrections après vitruve).
 *
 * Chacune relit l'état, change UN élément, renvoie l'entité ENTIÈRE avec la
 * **précondition** (`expectedPermissions` pour un rôle, `expectedUpdatedAt`
 * pour une fiche) et l'en-tête `x-lfd-agent-tool`, puis relit et rend l'état
 * d'après. La garde ({@link roleRefusal}, {@link personRefusal},
 * {@link permissionRefusal}) passe AVANT tout appel d'écriture.
 */
export function declareAccessWriteTools(deps: AccessWriteDeps): void {
  const { rolesApi } = deps;

  async function changeRole(
    tool: 'role_grant' | 'role_revoke',
    args: { readonly key: string; readonly permission: string },
    change: (grants: StaffRoleView['grants'], wanted: ParsedPermission) => GrantChange | null,
  ): Promise<string> {
    const what = tool === 'role_grant' ? 'Accord du droit' : 'Retrait du droit';
    const wanted = parsePermission(args.permission);
    if (wanted === null) {
      return `${what} — REFUSÉ : « ${args.permission} » n’est pas un droit du catalogue (forme ressource:action, action read ou write).`;
    }
    const role = (await rolesApi.list()).find((candidate) => candidate.key === args.key.trim());
    if (role === undefined) {
      return `${what} — REFUSÉ : aucun rôle n’a la clé ${args.key}. Relire roles_list.`;
    }
    const refusal = permissionRefusal(wanted.permission) ?? roleRefusal(role, deps.me(), true);
    if (refusal !== null) {
      return `${what} — REFUSÉ : ${refusal}`;
    }
    const next = change(role.grants, wanted);
    if (next === null) {
      return `RIEN À FAIRE — le rôle tient déjà cet état pour ${wanted.permission}.\n${roleText(role)}`;
    }
    await rolesApi.update(
      role.key,
      { label: role.label, grants: [...next.grants], expectedPermissions: [...role.permissions] },
      tool,
    );
    const after = (await rolesApi.list()).find((candidate) => candidate.key === role.key);
    return [
      `MODIFIÉ — « ${role.label} » : ${next.said}. ${EFFECTIVE_WITHIN}`,
      after === undefined ? `clé ${role.key} (relecture : introuvable)` : roleText(after),
    ].join('\n');
  }

  void declareExperimentalWebMcpTool({
    name: 'role_grant',
    description: `Accorde UN droit (\`permission\`, ressource:action) à un rôle (\`key\`), comme cocher une case de l'écran Rôles : relit le rôle, ajoute ce droit seul (l'écriture emporte la lecture), renvoie le rôle entier avec une précondition — si quelqu'un l'a modifié entre-temps, le serveur refuse (409) : relire et recommencer. ${GUARD_HELP} Rend le rôle relu.`,
    inputSchema: ROLE_INPUT,
    execute: (args) => said('Accord du droit', () => changeRole('role_grant', args, withGrant)),
  });

  void declareExperimentalWebMcpTool({
    name: 'role_revoke',
    description: `Retire UN droit (\`permission\`, ressource:action) d'un rôle (\`key\`) : retirer l'écriture laisse la lecture, retirer la lecture retire la ressource entière. Même précondition que role_grant. ${GUARD_HELP} Un rôle sans aucun droit est refusé par le serveur. Rend le rôle relu.`,
    inputSchema: ROLE_INPUT,
    execute: (args) =>
      said('Retrait du droit', () => changeRole('role_revoke', args, withoutGrant)),
  });

  void declareExperimentalWebMcpTool({
    name: 'staff_assign_role',
    description: `Change le rôle d'une personne (\`staffUserId\`, staff_list) pour le rôle \`roleKey\` (roles_list). Ses dérogations et son identité sont GARDÉES telles quelles ; si sa fiche a changé depuis la lecture, le serveur refuse (409). Refusé, avec la raison : vous-même, la fiche de secours, une personne qui gère les droits (staff_access) ou tient superadmin/admin, et un rôle cible superadmin, admin, archivé ou qui ouvre la gestion des droits. Rend les droits effectifs relus.`,
    inputSchema: {
      type: 'object',
      properties: { staffUserId: { type: 'string' }, roleKey: { type: 'string' } },
      required: ['staffUserId', 'roleKey'],
      additionalProperties: false,
    },
    execute: (args) => said('Changement de rôle', () => assignRole(deps, args)),
  });
}

async function assignRole(
  deps: AccessWriteDeps,
  args: { readonly staffUserId: string; readonly roleKey: string },
): Promise<string> {
  const what = 'Changement de rôle';
  const [people, roles] = await Promise.all([deps.staffApi.list(), deps.rolesApi.list()]);
  const person = people.find((candidate) => candidate.id === args.staffUserId.trim());
  if (person === undefined) {
    return `${what} — REFUSÉ : aucune personne n’a l’id ${args.staffUserId}. Relire staff_list.`;
  }
  const target = roles.find((candidate) => candidate.key === args.roleKey.trim());
  if (target === undefined) {
    return `${what} — REFUSÉ : aucun rôle n’a la clé ${args.roleKey}. Relire roles_list.`;
  }
  const refusal =
    personRefusal(person, deps.me()) ??
    roleRefusal(target, deps.me(), false) ??
    (target.archivedAt === null
      ? null
      : `le rôle « ${target.label} » est archivé : il ne s’attribue plus.`);
  if (refusal !== null) {
    return `${what} — REFUSÉ : ${refusal}`;
  }
  if (person.role === target.key) {
    return `RIEN À FAIRE — ${person.firstName} ${person.lastName} tient déjà « ${target.label} ».\n${accessOfText(person)}`;
  }
  await deps.staffApi.update(person.id, reassigned(person, target.key), 'staff_assign_role');
  const after = (await deps.staffApi.list()).find((candidate) => candidate.id === person.id);
  return [
    `MODIFIÉ — rôle « ${person.roleLabel} » → « ${target.label} ». ${EFFECTIVE_WITHIN}`,
    after === undefined ? `id ${person.id} (relecture : introuvable)` : accessOfText(after),
  ].join('\n');
}

/**
 * La fiche ENTIÈRE à renvoyer : `PATCH` exige toute la fiche, et des
 * `overrides` absents y valent « aucune » — le dépôt effacerait toutes les
 * dérogations de la personne. On renvoie donc identité et dérogations telles
 * que lues, rôle seul changé, avec la date lue en précondition.
 */
export function reassigned(person: StaffUserView, roleKey: string): UpdateStaffUserPayload {
  return {
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email,
    phone: person.phone,
    jobTitle: person.jobTitle,
    role: roleKey,
    overrides: person.overrides.map((override) => ({ ...override })),
    expectedUpdatedAt: person.updatedAt,
  };
}
