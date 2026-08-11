import {
  alertDeliverySchema,
  alertKindSchema,
  alertParamsSchema,
  type AccountAlertOverride,
  type AlertKind,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { Prisma } from "../../infra/database/client/client.js";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { AccountAlertOverridesStore } from "../domain/ports/account-alert-overrides.store.js";

/** Une ligne `account_alert_overrides`, vue d'ici seulement. */
interface OverrideRow {
  readonly kind: string;
  readonly mode: string;
  readonly enabled: boolean | null;
  readonly params: unknown;
  readonly delivery: unknown;
}

/**
 * Lecture/écriture des dérogations d'un compte.
 *
 * Comme pour les réglages globaux, le mapper **écarte** une ligne qu'il ne sait
 * plus relire : le compte retombe alors sur le réglage global — le comportement
 * le moins surprenant, et le seul qui ne laisse pas un écran inaccessible.
 */
@Injectable()
export class PrismaAccountAlertOverridesStore extends AccountAlertOverridesStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async readForCompany(companyId: string): Promise<AccountAlertOverride[]> {
    const rows = await this.prisma.accountAlertOverride.findMany({ where: { companyId } });
    return rows.map((row) => toDomain(row)).filter(isReadable);
  }

  async save(companyId: string, override: AccountAlertOverride): Promise<void> {
    // `Prisma.DbNull` et non `null` : sur une colonne Json nullable, `null` est
    // ambigu (le littéral JSON `null` ou l'absence de valeur ?), et Prisma refuse
    // de trancher à notre place. Ici c'est bien l'absence — une règle éteinte n'a
    // rien à régler.
    const values =
      override.mode === "off"
        ? { mode: "off", enabled: null, params: Prisma.DbNull, delivery: Prisma.DbNull }
        : {
            mode: "custom",
            enabled: override.rule.enabled,
            params: override.rule.params,
            delivery: override.rule.delivery,
          };
    await this.prisma.accountAlertOverride.upsert({
      where: { companyId_kind: { companyId, kind: override.kind } },
      create: { companyId, kind: override.kind, ...values },
      update: values,
    });
  }

  /**
   * Revenir au global **supprime** la ligne. `deleteMany` plutôt que `delete` :
   * annuler une dérogation qui n'existe pas est un non-événement, pas une erreur
   * — le staff a cliqué deux fois, l'état voulu est atteint.
   */
  async clear(companyId: string, kind: AlertKind): Promise<void> {
    await this.prisma.accountAlertOverride.deleteMany({ where: { companyId, kind } });
  }
}

function isReadable(override: AccountAlertOverride | null): override is AccountAlertOverride {
  return override !== null;
}

/** `null` = ligne illisible : le compte retombera sur le réglage global. */
function toDomain(row: OverrideRow): AccountAlertOverride | null {
  const kind = alertKindSchema.safeParse(row.kind);
  if (!kind.success) {
    return null;
  }
  if (row.mode === "off") {
    return { kind: kind.data, mode: "off" };
  }
  const params = alertParamsSchema.safeParse(row.params);
  const delivery = alertDeliverySchema.safeParse(row.delivery);
  if (row.mode !== "custom" || !params.success || !delivery.success) {
    return null;
  }
  if (params.data.kind !== kind.data) {
    return null;
  }
  return {
    kind: kind.data,
    mode: "custom",
    rule: { enabled: row.enabled ?? true, params: params.data, delivery: delivery.data },
  };
}
