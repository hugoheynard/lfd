import { declareExperimentalWebMcpTool, inject } from '@angular/core';
import type { StaffRoleView, StaffUserView } from '@lfd/contracts';

import { StaffRolesService } from '../admin/roles/staff-roles.service';
import { StaffUsersService } from '../admin/staff-users/staff-users.service';
import { PermissionsStore } from '../auth/permissions.store';

import { declareAccessWriteTools } from './access-agent-write-tools';
import { parsePermission } from './access-agent-guard';
import {
  accessOfText,
  rolesListText,
  roleText,
  staffListText,
  whoCanText,
} from './access-agent-text';
import { said } from './agent-tool-text';

/** Les outils de lecture — déclarés avec `staff_access:read`. */
export const ACCESS_READ_TOOLS = [
  'roles_list',
  'role_get',
  'staff_list',
  'staff_access_of',
  'who_can',
] as const;
/** Les outils d'écriture — déclarés en plus avec `staff_access:write`. */
export const ACCESS_WRITE_TOOLS = ['role_grant', 'role_revoke', 'staff_assign_role'] as const;

const NO_INPUT = { type: 'object', properties: {}, additionalProperties: false } as const;

/**
 * **Les outils WebMCP des droits** (Hugo, 2026-10-15) — Équipe → Rôles et
 * Équipe → Annuaire, sans le clic. Plan :
 * `documentation/droits-et-permissions/plan-outils-agent-droits.md`.
 *
 * Les lectures rendent ce que le serveur a RÉSOLU (`StaffRoleView.permissions`,
 * `StaffUserView.permissions/overrides/isRescue`) : aucun outil ne recombine
 * rôle et dérogations — deux implémentations d'une règle divergent toujours.
 *
 * Les écritures vivent dans {@link declareAccessWriteTools}, avec leur garde.
 */
export function declareAccessAgentTools(canWrite: boolean): readonly string[] {
  const rolesApi = inject(StaffRolesService);
  const staffApi = inject(StaffUsersService);
  const permissions = inject(PermissionsStore);

  async function role(key: string): Promise<StaffRoleView | undefined> {
    return (await rolesApi.list()).find((candidate) => candidate.key === key.trim());
  }

  async function person(id: string): Promise<StaffUserView | undefined> {
    return (await staffApi.list()).find((candidate) => candidate.id === id.trim());
  }

  void declareExperimentalWebMcpTool({
    name: 'roles_list',
    description:
      'Les rôles du back-office : clé, libellé, état (actif, archivé, verrouillé), nombre de porteurs et de droits résolus. Lecture seule.',
    inputSchema: NO_INPUT,
    execute: () => said('Lecture des rôles', async () => rolesListText(await rolesApi.list())),
  });

  void declareExperimentalWebMcpTool({
    name: 'role_get',
    description:
      'Les droits d’un rôle par sa `key` (roles_list), rangés par catégorie avec leurs libellés — tels que le serveur les résout. Lecture seule.',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Lecture du rôle', async () => {
        const found = await role(args.key);
        return found === undefined
          ? `Lecture du rôle — REFUSÉ : aucun rôle n’a la clé ${args.key}. Relire roles_list.`
          : roleText(found);
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'staff_list',
    description:
      'L’annuaire de l’équipe : chaque personne, son id, son rôle, son statut, et la fiche de secours. Lecture seule.',
    inputSchema: NO_INPUT,
    execute: () => said('Lecture de l’annuaire', async () => staffListText(await staffApi.list())),
  });

  void declareExperimentalWebMcpTool({
    name: 'staff_access_of',
    description:
      'Les droits EFFECTIFS d’une personne par son `staffUserId` (staff_list) : son rôle, ses dérogations (accordé en plus, refusé malgré le rôle) et le résultat, tel que le serveur le résout. Lecture seule.',
    inputSchema: {
      type: 'object',
      properties: { staffUserId: { type: 'string' } },
      required: ['staffUserId'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Lecture des droits', async () => {
        const found = await person(args.staffUserId);
        return found === undefined
          ? `Lecture des droits — REFUSÉ : aucune personne n’a l’id ${args.staffUserId}. Relire staff_list.`
          : accessOfText(found);
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'who_can',
    description:
      'Qui tient un droit (`permission`, de la forme ressource:action, ex. lfc_legal:write) : les rôles qui le donnent, puis chaque personne qui le tient, par son rôle ou par dérogation. Lecture seule.',
    inputSchema: {
      type: 'object',
      properties: { permission: { type: 'string' } },
      required: ['permission'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Qui peut', async () => {
        const wanted = parsePermission(args.permission);
        if (wanted === null) {
          return `Qui peut — REFUSÉ : « ${args.permission} » n’est pas un droit du catalogue (forme ressource:action, action read ou write).`;
        }
        const [roles, people] = await Promise.all([rolesApi.list(), staffApi.list()]);
        return whoCanText(wanted, roles, people);
      }),
  });

  if (!canWrite) {
    return ACCESS_READ_TOOLS;
  }
  declareAccessWriteTools({ rolesApi, staffApi, me: () => permissions.identity() });
  return [...ACCESS_READ_TOOLS, ...ACCESS_WRITE_TOOLS];
}
