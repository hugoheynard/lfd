import type { SubAccountNoticeKind } from "@lfd/contracts";

import type { CompanyRole } from "../../account/domain/value-objects/company-role.js";
import type { SubAccountNoticeRuleOverride } from "../../account/domain/ports/sub-account-notice-rules.reader.js";
import {
  NOTICE_KINDS,
  NOTICE_ROLES,
  SUB_ACCOUNT_NOTICE_DEFAULTS,
} from "./sub-account-notice-defaults.js";

/** Une cellule du tableau, résolue : ce qui s'applique, et si c'est le défaut. */
export interface NoticeCell {
  readonly kind: SubAccountNoticeKind;
  readonly role: CompanyRole;
  readonly enabled: boolean;
  readonly atDefault: boolean;
}

/** La cellule (kind, role) au défaut du §1. */
export function defaultEnabled(kind: SubAccountNoticeKind, role: CompanyRole): boolean {
  return SUB_ACCOUNT_NOTICE_DEFAULTS[kind].includes(role);
}

/**
 * Le tableau complet d'un principal : chaque cellule prend la dérogation du
 * staff si elle existe, sinon le défaut. Une dérogation qui redit le défaut
 * compte comme le défaut — l'écriture l'efface de toute façon.
 */
export function noticeGrid(overrides: readonly SubAccountNoticeRuleOverride[]): NoticeCell[] {
  return NOTICE_KINDS.flatMap((kind) =>
    NOTICE_ROLES.map((role) => {
      const enabled = cellEnabled(kind, role, overrides);
      return { kind, role, enabled, atDefault: enabled === defaultEnabled(kind, role) };
    }),
  );
}

/**
 * **Les rôles du principal prévenus de cette action** (§1, §3) : dérogations
 * du staff, sinon défaut. L'ordre est celui des colonnes du tableau.
 */
export function notifiedRoles(
  kind: SubAccountNoticeKind,
  overrides: readonly SubAccountNoticeRuleOverride[],
): CompanyRole[] {
  return NOTICE_ROLES.filter((role) => cellEnabled(kind, role, overrides));
}

function cellEnabled(
  kind: SubAccountNoticeKind,
  role: CompanyRole,
  overrides: readonly SubAccountNoticeRuleOverride[],
): boolean {
  const override = overrides.find((rule) => rule.kind === kind && rule.role === role);
  return override?.enabled ?? defaultEnabled(kind, role);
}
