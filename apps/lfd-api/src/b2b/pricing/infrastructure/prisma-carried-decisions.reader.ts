import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  audienceKey,
  ruleCarryKey,
  type CarriedFamily,
} from "../domain/entities/decision-carry-over.js";
import { CarriedDecisionsReader } from "../domain/ports/carried-decisions.reader.js";

/** Les portées qui nomment une référence — les seules qu'un report pose. */
const REFERENCE_SCOPES = ["product", "variant"];

/**
 * Les décisions d'une famille debout sur `toSku`, venues de `fromSku`
 * (`plan-report-apres-detachement.md`, § 3). L'origine est lue par chemin
 * `jsonb` (`origin->>'fromSku'`) : pas d'unicité en base, c'est le verrou du
 * handler qui sérialise. Les lectures ignorent le mur tenant, et c'est le
 * sujet : la question vaut pour l'article, toutes sociétés confondues — le
 * report d'une société n'empêche pas celui d'une autre, puisque l'audience
 * fait partie de la clé.
 */
@Injectable()
export class PrismaCarriedDecisionsReader extends CarriedDecisionsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  carriedAudiences(
    family: CarriedFamily,
    fromSku: string,
    toSku: string,
    at: Date,
  ): Promise<readonly string[]> {
    return this.readers[family](carriedWhere(fromSku, toSku), at);
  }

  /** Une lecture par table, en table exhaustive : une famille de plus ne compile pas sans la sienne. */
  private readonly readers: Readonly<
    Record<CarriedFamily, (where: CarriedWhere, at: Date) => Promise<readonly string[]>>
  > = {
    price_rule: async (where, at) =>
      (await this.prisma.priceRule.findMany({ where: { ...where, ...openAt(at) } })).map((row) =>
        ruleCarryKey({
          stage: row.stage,
          audience: { type: row.audienceType, id: row.audienceId },
          minQuantity: row.minQuantity,
        }),
      ),
    volume_ladder: async (where, at) =>
      (await this.prisma.volumeLadder.findMany({ where: { ...where, ...openAt(at) } })).map((row) =>
        audienceKey({ type: row.audienceType, id: row.audienceId }),
      ),
    price_floor: async (where, at) =>
      (await this.prisma.priceFloor.findMany({ where: { ...where, ...openAt(at) } })).map(
        (row) => row.clientele,
      ),
    // La fin d'un engagement est obligatoire : pas de `validTo: null` à admettre.
    volume_commitment: async (where, at) =>
      (
        await this.prisma.volumeCommitment.findMany({ where: { ...where, validTo: { gt: at } } })
      ).map((row) => row.companyId),
  };
}

type CarriedWhere = ReturnType<typeof carriedWhere>;

/** Non rangée, sur la nouvelle référence, venue de l'ancienne. */
function carriedWhere(fromSku: string, toSku: string) {
  return {
    archivedAt: null,
    scopeType: { in: REFERENCE_SCOPES },
    scopeId: toSku,
    origin: { path: ["fromSku"], equals: fromSku },
  };
}

/** Debout à `at` : fenêtre ouverte, ou close plus tard. */
function openAt(at: Date) {
  return { OR: [{ validTo: null }, { validTo: { gt: at } }] };
}
