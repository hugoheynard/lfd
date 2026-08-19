import {
  alertDeliverySchema,
  alertKindSchema,
  alertParamsSchema,
  type AlertKind,
  type AlertRule,
} from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { StoredAlertRule } from "../domain/alert-rules.js";
import { AlertRulesStore } from "../domain/ports/alert-rules.store.js";

/** La forme d'une ligne `alert_rule_settings`, vue d'ici seulement. */
interface AlertRuleRow {
  readonly kind: string;
  readonly enabled: boolean;
  readonly params: unknown;
  readonly delivery: unknown;
  readonly updatedAt: Date;
  readonly updatedBy: string | null;
}

/**
 * Lecture/écriture des réglages globaux d'alerte.
 *
 * Le mapper **relit le JSON contre le contrat** et **écarte** ce qu'il ne sait
 * plus lire — un type retiré du code, une forme changée sans migration. Une
 * ligne illisible fait alors retomber son type sur ses défauts (cf.
 * `resolveGlobalRules`) au lieu de casser l'écran de réglages : une règle qu'on
 * ne sait plus relire doit se corriger là où on la règle, pas rendre la page
 * inaccessible.
 */
@Injectable()
export class PrismaAlertRulesStore extends AlertRulesStore {
  private readonly logger = new Logger(PrismaAlertRulesStore.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async readAll(): Promise<StoredAlertRule[]> {
    const rows = await this.prisma.alertRuleSetting.findMany();
    const parsed = rows.map((row) => toDomain(row));
    parsed.forEach((rule, index) => {
      if (rule === null || !rule.readable) {
        // Une ligne illisible se DIT. La première version la laissait tomber en
        // silence, si bien qu'un réglage coupé pouvait revenir aux défauts sans
        // que rien ne l'indique — ni log, ni écran.
        this.logger.warn(`Réglage d'alerte illisible : ${rows[index]?.kind ?? "?"}`);
      }
    });
    return parsed.filter(isKnown);
  }

  async save(input: {
    readonly kind: AlertKind;
    readonly rule: AlertRule;
    readonly staffSub: string;
    readonly expectedUpdatedAt: Date | null;
  }): Promise<boolean> {
    const values = {
      enabled: input.rule.enabled,
      params: input.rule.params,
      delivery: input.rule.delivery,
      updatedBy: input.staffSub,
    };
    if (input.expectedUpdatedAt === null) {
      // L'appelant croyait le type jamais réglé. `createMany` + `skipDuplicates`
      // plutôt qu'un `create` qui lèverait : une ligne apparue entre-temps n'est
      // pas une panne, c'est la course qu'on cherchait justement à détecter.
      const created = await this.prisma.alertRuleSetting.createMany({
        data: [{ kind: input.kind, ...values }],
        skipDuplicates: true,
      });
      return created.count === 1;
    }
    // `updateMany` porte la version dans son `where` : zéro ligne touchée = la
    // ligne a bougé. Un `update` ciblé ne saurait pas faire la différence entre
    // « absente » et « modifiée ».
    const written = await this.prisma.alertRuleSetting.updateMany({
      where: { kind: input.kind, updatedAt: input.expectedUpdatedAt },
      data: values,
    });
    return written.count === 1;
  }
}

function isKnown(rule: StoredAlertRule | null): rule is StoredAlertRule {
  return rule !== null;
}

/**
 * Relit une ligne contre le contrat courant.
 *
 * Un `kind` inconnu rend `null` : la ligne ne désigne **aucun** type existant,
 * elle n'a donc rien à dégrader — le lecteur parcourt les types connus, il ne la
 * cherchera jamais. Tout le reste remonte en `readable: false` **avec son type**,
 * pour que l'écran puisse dire lequel est illisible.
 */
function toDomain(row: AlertRuleRow): StoredAlertRule | null {
  const kind = alertKindSchema.safeParse(row.kind);
  if (!kind.success) {
    return null;
  }
  const params = alertParamsSchema.safeParse(row.params);
  const delivery = alertDeliverySchema.safeParse(row.delivery);
  // Une ligne dont le `kind` interne aurait dérivé de sa clé est corrompue : la
  // clé fait foi, on refuse plutôt que de servir les réglages d'un autre type.
  if (!params.success || !delivery.success || params.data.kind !== kind.data) {
    return {
      kind: kind.data,
      readable: false,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
    };
  }
  return {
    kind: kind.data,
    readable: true,
    enabled: row.enabled,
    params: params.data,
    delivery: delivery.data,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}
