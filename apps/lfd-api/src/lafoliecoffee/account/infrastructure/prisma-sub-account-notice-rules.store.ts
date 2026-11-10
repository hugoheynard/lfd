import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  SubAccountNoticeRulesReader,
  type SubAccountNoticeRuleOverride,
} from "../domain/ports/sub-account-notice-rules.reader.js";
import { SubAccountNoticeRulesWriter } from "../domain/ports/sub-account-notice-rules.writer.js";

/** Lecture des dérogations — `kind` et `role` sont des enums Postgres : aucune valeur inconnue. */
@Injectable()
export class PrismaSubAccountNoticeRulesReader extends SubAccountNoticeRulesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async overridesOf(principalId: string): Promise<readonly SubAccountNoticeRuleOverride[]> {
    return this.prisma.subAccountNoticeRule.findMany({
      where: { principalCompanyId: principalId },
      select: { kind: true, role: true, enabled: true },
    });
  }
}

/**
 * Écriture des dérogations. Revenir au défaut supprime la ligne : une
 * dérogation n'est pas un agrégat métier, c'est l'absence de ligne qui dit
 * « le défaut » (même choix que `account_alert_overrides`).
 */
@Injectable()
export class PrismaSubAccountNoticeRulesWriter extends SubAccountNoticeRulesWriter {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async set(
    principalId: string,
    rule: SubAccountNoticeRuleOverride,
    staffId: string,
    at: Date,
  ): Promise<void> {
    const values = { enabled: rule.enabled, updatedBy: staffId, updatedAt: at };
    await this.prisma.subAccountNoticeRule.upsert({
      where: {
        principalCompanyId_kind_role: {
          principalCompanyId: principalId,
          kind: rule.kind,
          role: rule.role,
        },
      },
      create: { principalCompanyId: principalId, kind: rule.kind, role: rule.role, ...values },
      update: values,
    });
  }

  async clear(
    principalId: string,
    rule: Omit<SubAccountNoticeRuleOverride, "enabled">,
  ): Promise<void> {
    await this.prisma.subAccountNoticeRule.deleteMany({
      where: { principalCompanyId: principalId, kind: rule.kind, role: rule.role },
    });
  }

  async clearAll(principalId: string): Promise<void> {
    await this.prisma.subAccountNoticeRule.deleteMany({
      where: { principalCompanyId: principalId },
    });
  }
}
