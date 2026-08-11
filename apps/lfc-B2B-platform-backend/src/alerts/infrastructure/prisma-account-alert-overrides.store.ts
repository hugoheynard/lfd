import {
  alertDeliverySchema,
  alertKindSchema,
  alertParamsSchema,
  type AccountAlertOverride,
  type AlertKind,
} from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import { Prisma } from "../../infra/database/client/client.js";
import { PrismaService } from "../../infra/database/prisma.service.js";
import type { StoredOverride } from "../domain/account-alert-rules.js";
import { AccountAlertOverridesStore } from "../domain/ports/account-alert-overrides.store.js";

/** Une ligne `account_alert_overrides`, vue d'ici seulement. */
interface OverrideRow {
  readonly kind: string;
  readonly mode: string;
  readonly enabled: boolean | null;
  readonly params: unknown;
  readonly delivery: unknown;
  readonly updatedAt: Date;
}

/**
 * Lecture/écriture des dérogations d'un compte.
 *
 * Une ligne illisible remonte en `readable: false` **avec sa date** au lieu
 * d'être avalée : le domaine la traite alors comme un `off`, parce qu'on sait au
 * moins une chose de ce compte — il avait explicitement refusé le global.
 */
@Injectable()
export class PrismaAccountAlertOverridesStore extends AccountAlertOverridesStore {
  private readonly logger = new Logger(PrismaAccountAlertOverridesStore.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async readForCompany(companyId: string): Promise<StoredOverride[]> {
    const rows = await this.prisma.accountAlertOverride.findMany({ where: { companyId } });
    const parsed = rows.map((row) => toDomain(row));
    parsed.forEach((stored, index) => {
      if (stored !== null && !stored.readable) {
        this.logger.warn(
          `Dérogation d'alerte illisible, traitée comme désactivée : ${companyId} / ${rows[index]?.kind ?? "?"}`,
        );
      }
    });
    return parsed.filter(isKnown);
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

function isKnown(stored: StoredOverride | null): stored is StoredOverride {
  return stored !== null;
}

/** `null` = type inconnu : la ligne ne désigne rien qu'on sache traiter. */
function toDomain(row: OverrideRow): StoredOverride | null {
  const kind = alertKindSchema.safeParse(row.kind);
  if (!kind.success) {
    return null;
  }
  if (row.mode === "off") {
    return { readable: true, override: { kind: kind.data, mode: "off" }, updatedAt: row.updatedAt };
  }
  const params = alertParamsSchema.safeParse(row.params);
  const delivery = alertDeliverySchema.safeParse(row.delivery);
  if (row.mode !== "custom" || !params.success || !delivery.success) {
    return { readable: false, kind: kind.data, updatedAt: row.updatedAt };
  }
  if (params.data.kind !== kind.data) {
    return { readable: false, kind: kind.data, updatedAt: row.updatedAt };
  }
  return {
    readable: true,
    override: {
      kind: kind.data,
      mode: "custom",
      rule: { enabled: row.enabled ?? true, params: params.data, delivery: delivery.data },
    },
    updatedAt: row.updatedAt,
  };
}
