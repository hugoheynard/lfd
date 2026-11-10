import {
  CompanyParentReader,
  type CompanyParent,
} from "../../../account/domain/ports/company-parent.reader.js";
import {
  SubAccountNoticeRulesReader,
  type SubAccountNoticeRuleOverride,
} from "../../../account/domain/ports/sub-account-notice-rules.reader.js";
import {
  SubAccountNoticeSwitchReader,
  SubAccountNoticeSwitchWriter,
} from "../../../account/domain/ports/sub-account-notice-switch.js";
import { SubAccountNoticeRulesWriter } from "../../../account/domain/ports/sub-account-notice-rules.writer.js";

/** Les sociétés connues, et leur principal. Une société absente est inconnue. */
export class FixedCompanyParents extends CompanyParentReader {
  constructor(private readonly places: ReadonlyMap<string, CompanyParent>) {
    super();
  }

  parentOf(companyId: string): Promise<CompanyParent | null> {
    return Promise.resolve(this.places.get(companyId) ?? null);
  }
}

/** Le tableau tenu en mémoire : la même table, lue et écrite par les deux ports. */
export class InMemoryNoticeRules extends SubAccountNoticeRulesReader {
  readonly rows = new Map<string, SubAccountNoticeRuleOverride & { staffId: string; at: Date }>();

  readonly writer: SubAccountNoticeRulesWriter;

  constructor() {
    super();
    this.writer = new InMemoryNoticeRulesWriter(this.rows);
  }

  overridesOf(principalId: string): Promise<readonly SubAccountNoticeRuleOverride[]> {
    return Promise.resolve(
      [...this.rows.entries()]
        .filter(([key]) => key.startsWith(`${principalId}/`))
        .map(([, row]) => ({ kind: row.kind, role: row.role, enabled: row.enabled })),
    );
  }
}

class InMemoryNoticeRulesWriter extends SubAccountNoticeRulesWriter {
  constructor(
    private readonly rows: Map<
      string,
      SubAccountNoticeRuleOverride & { staffId: string; at: Date }
    >,
  ) {
    super();
  }

  set(
    principalId: string,
    rule: SubAccountNoticeRuleOverride,
    staffId: string,
    at: Date,
  ): Promise<void> {
    this.rows.set(`${principalId}/${rule.kind}/${rule.role}`, { ...rule, staffId, at });
    return Promise.resolve();
  }

  clear(principalId: string, rule: Omit<SubAccountNoticeRuleOverride, "enabled">): Promise<void> {
    this.rows.delete(`${principalId}/${rule.kind}/${rule.role}`);
    return Promise.resolve();
  }

  clearAll(principalId: string): Promise<void> {
    [...this.rows.keys()]
      .filter((key) => key.startsWith(`${principalId}/`))
      .forEach((key) => this.rows.delete(key));
    return Promise.resolve();
  }
}

/** Un principal (`alpes`) et son site (`chalet`). */
export function alpesAndChalet(): FixedCompanyParents {
  return new FixedCompanyParents(
    new Map([
      ["alpes", { parentCompanyId: null }],
      ["chalet", { parentCompanyId: "alpes" }],
    ]),
  );
}

/**
 * L'interrupteur tenu en mémoire, lu et écrit par les deux ports. Sans ligne,
 * désactivé — comme la base ; `enabledFor` l'active d'emblée pour les suites
 * qui éprouvent l'envoi.
 */
export class InMemoryNoticeSwitches extends SubAccountNoticeSwitchReader {
  readonly rows = new Map<string, { enabled: boolean; staffId: string; at: Date }>();

  readonly writer: SubAccountNoticeSwitchWriter;

  constructor(...enabledFor: readonly string[]) {
    super();
    this.writer = new InMemoryNoticeSwitchWriter(this.rows);
    for (const principalId of enabledFor) {
      this.rows.set(principalId, { enabled: true, staffId: "staff_seed", at: new Date(0) });
    }
  }

  isEnabled(principalId: string): Promise<boolean> {
    return Promise.resolve(this.rows.get(principalId)?.enabled ?? false);
  }
}

class InMemoryNoticeSwitchWriter extends SubAccountNoticeSwitchWriter {
  constructor(private readonly rows: Map<string, { enabled: boolean; staffId: string; at: Date }>) {
    super();
  }

  set(principalId: string, enabled: boolean, staffId: string, at: Date): Promise<void> {
    this.rows.set(principalId, { enabled, staffId, at });
    return Promise.resolve();
  }
}
