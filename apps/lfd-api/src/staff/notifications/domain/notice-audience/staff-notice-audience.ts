import { STAFF_NOTICE_TEMPLATES, type StaffNoticeTemplate } from "@lfd/contracts";

import {
  ArchivedNoticeRoleError,
  UnknownNoticeMemberError,
  UnknownNoticeRoleError,
  UnknownStaffNoticeError,
} from "./staff-notice-audience.errors.js";

/** Ce que l'annuaire sait d'un rôle qu'on vise. */
export interface NoticeRoleTarget {
  readonly label: string;
  readonly archived: boolean;
}

/**
 * Les rôles et les membres que le réglage cite, lus dans l'annuaire : un id
 * absent des deux tables n'existe pas.
 */
export interface NoticeTargets {
  readonly roles: ReadonlyMap<string, NoticeRoleTarget>;
  /** Le nom lisible de chaque fiche, « Prénom Nom ». */
  readonly members: ReadonlyMap<string, string>;
}

/** Ce qu'un réglage a changé, en libellés lisibles — vide s'il n'a rien changé. */
export interface NoticeAudienceChange {
  readonly added: readonly string[];
  readonly removed: readonly string[];
}

/** Ce que le dépôt écrit et relit. */
export interface NoticeAudienceSnapshot {
  readonly template: StaffNoticeTemplate;
  readonly roleKeys: readonly string[];
  readonly staffUserIds: readonly string[];
}

/** « Rôle Comptabilité » : un rôle et un membre ne se confondent pas au journal. */
export function roleWording(label: string): string {
  return `Rôle ${label}`;
}

/**
 * **Les destinataires d'un avis** — pour un modèle d'e-mail, les rôles et les
 * membres à qui il part (lot P1c). L'agrégat refuse un avis inconnu, un rôle
 * ou un membre qui n'existe pas, et l'AJOUT d'un rôle archivé ; il
 * dédoublonne et trie, si bien qu'un réglage identique ne change rien.
 */
export class StaffNoticeAudience {
  private constructor(
    readonly template: StaffNoticeTemplate,
    private roleKeys: readonly string[],
    private staffUserIds: readonly string[],
  ) {}

  /** Un avis sans réglage, ou relu. Refuse un modèle qui ne se règle pas. */
  static of(
    template: string,
    roleKeys: readonly string[] = [],
    staffUserIds: readonly string[] = [],
  ): StaffNoticeAudience {
    const known = STAFF_NOTICE_TEMPLATES.find((candidate) => candidate === template);
    if (known === undefined) {
      throw new UnknownStaffNoticeError(template);
    }
    return new StaffNoticeAudience(known, sortedSet(roleKeys), sortedSet(staffUserIds));
  }

  /**
   * Pose l'ensemble voulu. Tout est vérifié avant d'écrire quoi que ce soit.
   *
   * @throws {UnknownNoticeRoleError} un rôle cité n'existe pas.
   * @throws {ArchivedNoticeRoleError} un rôle ajouté est archivé.
   * @throws {UnknownNoticeMemberError} un membre cité n'existe pas.
   */
  settle(
    roleKeys: readonly string[],
    staffUserIds: readonly string[],
    targets: NoticeTargets,
  ): NoticeAudienceChange {
    const nextRoles = sortedSet(roleKeys);
    const nextMembers = sortedSet(staffUserIds);
    for (const key of nextRoles) {
      const role = targets.roles.get(key);
      if (role === undefined) throw new UnknownNoticeRoleError(key);
      if (role.archived && !this.roleKeys.includes(key))
        throw new ArchivedNoticeRoleError(role.label);
    }
    for (const id of nextMembers) {
      if (!targets.members.has(id)) throw new UnknownNoticeMemberError(id);
    }
    const change = describeChange(this.snapshot(), nextRoles, nextMembers, targets);
    this.roleKeys = nextRoles;
    this.staffUserIds = nextMembers;
    return change;
  }

  snapshot(): NoticeAudienceSnapshot {
    return { template: this.template, roleKeys: this.roleKeys, staffUserIds: this.staffUserIds };
  }
}

function sortedSet(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function describeChange(
  before: NoticeAudienceSnapshot,
  roles: readonly string[],
  members: readonly string[],
  targets: NoticeTargets,
): NoticeAudienceChange {
  const roleName = (key: string): string => roleWording(targets.roles.get(key)?.label ?? key);
  const memberName = (id: string): string => targets.members.get(id) ?? id;
  return {
    added: [
      ...roles.filter((key) => !before.roleKeys.includes(key)).map(roleName),
      ...members.filter((id) => !before.staffUserIds.includes(id)).map(memberName),
    ],
    removed: [
      ...before.roleKeys.filter((key) => !roles.includes(key)).map(roleName),
      ...before.staffUserIds.filter((id) => !members.includes(id)).map(memberName),
    ],
  };
}
