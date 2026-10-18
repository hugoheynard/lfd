import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  StaffSuggestionRule,
  type StaffSuggestionRuleSnapshot,
} from "../domain/entities/staff-suggestion-rule.js";
import { StaffSuggestionRuleReader } from "../domain/ports/staff-suggestion-rule.reader.js";
import { StaffSuggestionRuleRepository } from "../domain/ports/staff-suggestion-rule.repository.js";
import { ruleColumns, toRecord } from "./staff-suggestion-rows.js";

/** La plus récemment créée d'abord ; l'id départage deux créations au même instant. */
const RECENT_FIRST = [{ createdAt: "desc" as const }, { id: "desc" as const }];

/**
 * Le dépôt d'écriture des suggestions décidées, sur `staff_suggestion_rules`.
 * Il ne connaît que l'agrégat : l'état entier part par `add` ou `save`.
 */
@Injectable()
export class PrismaStaffSuggestionRuleRepository extends StaffSuggestionRuleRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(id: string): Promise<StaffSuggestionRule | null> {
    const row = await this.prisma.staffSuggestionRule.findUnique({ where: { id } });
    return row === null ? null : StaffSuggestionRule.reconstitute(toRecord(row));
  }

  async add(rule: StaffSuggestionRule): Promise<void> {
    await this.prisma.staffSuggestionRule.create({
      data: { id: rule.id, ...ruleColumns(rule.snapshot()) },
    });
  }

  async save(rule: StaffSuggestionRule): Promise<void> {
    await this.prisma.staffSuggestionRule.update({
      where: { id: rule.id },
      data: ruleColumns(rule.snapshot()),
    });
  }
}

/** La lecture des suggestions décidées : des instantanés, rejugés par l'agrégat. */
@Injectable()
export class PrismaStaffSuggestionRuleReader extends StaffSuggestionRuleReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly StaffSuggestionRuleSnapshot[]> {
    const rows = await this.prisma.staffSuggestionRule.findMany({ orderBy: RECENT_FIRST });
    return rows.map((row) => StaffSuggestionRule.reconstitute(toRecord(row)).snapshot());
  }

  async listLive(): Promise<readonly StaffSuggestionRuleSnapshot[]> {
    const rows = await this.prisma.staffSuggestionRule.findMany({
      where: { archivedAt: null },
      orderBy: RECENT_FIRST,
    });
    return rows.map((row) => StaffSuggestionRule.reconstitute(toRecord(row)).snapshot());
  }
}
