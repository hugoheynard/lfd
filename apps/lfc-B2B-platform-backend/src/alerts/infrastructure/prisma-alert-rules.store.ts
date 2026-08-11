import {
  alertDeliverySchema,
  alertKindSchema,
  alertParamsSchema,
  type AlertKind,
  type AlertRule,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import type { StoredAlertRule } from "../domain/alert-rules.js";
import { AlertRulesStore } from "../domain/ports/alert-rules.store.js";

/** La forme d'une ligne `alert_rule_settings`, vue d'ici seulement. */
interface AlertRuleRow {
  readonly kind: string;
  readonly enabled: boolean;
  readonly params: unknown;
  readonly delivery: unknown;
  readonly updatedAt: Date;
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
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async readAll(): Promise<StoredAlertRule[]> {
    const rows = await this.prisma.alertRuleSetting.findMany();
    return rows.map((row) => toDomain(row)).filter(isReadable);
  }

  async save(kind: AlertKind, rule: AlertRule): Promise<void> {
    const values = {
      enabled: rule.enabled,
      params: rule.params,
      delivery: rule.delivery,
    };
    await this.prisma.alertRuleSetting.upsert({
      where: { kind },
      create: { kind, ...values },
      update: values,
    });
  }
}

function isReadable(rule: StoredAlertRule | null): rule is StoredAlertRule {
  return rule !== null;
}

/** `null` = ligne illisible : le type retombera sur ses défauts. */
function toDomain(row: AlertRuleRow): StoredAlertRule | null {
  const kind = alertKindSchema.safeParse(row.kind);
  const params = alertParamsSchema.safeParse(row.params);
  const delivery = alertDeliverySchema.safeParse(row.delivery);
  if (!kind.success || !params.success || !delivery.success) {
    return null;
  }
  // Une ligne dont le `kind` interne aurait dérivé de sa clé est corrompue : la
  // clé fait foi, on refuse plutôt que de servir les réglages d'un autre type.
  if (params.data.kind !== kind.data) {
    return null;
  }
  return {
    kind: kind.data,
    enabled: row.enabled,
    params: params.data,
    delivery: delivery.data,
    updatedAt: row.updatedAt,
  };
}
