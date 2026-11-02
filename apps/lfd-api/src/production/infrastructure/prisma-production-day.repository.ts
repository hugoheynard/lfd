import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { ProductionDay } from "../domain/entities/production-day.js";
import { ProductionDayRepository } from "../domain/ports/production-day.repository.js";
import type { ServiceDay } from "../domain/value-objects/service-day.value-object.js";
import { writeDayChanges } from "./production-day-children.writer.js";
import { DAY_COLUMNS, daySnapshotOf } from "./production-day.row.js";
import { signerColumns } from "./production-day-signer.columns.js";

/**
 * L'adaptateur Prisma de la journée de production.
 *
 * Il porte **les deux mappers**, et aucun type `Prisma.*` ne le franchit :
 * `toDomain` rehydrate l'agrégat — dont les value objects revalident au passage
 * —, `save` lit ses getters. C'est la frontière que le `CLAUDE.md` exige, et
 * elle n'est pas décorative : sans elle, la forme des tables remonterait
 * jusqu'aux écrans du fournil, ce que ce contexte existe précisément pour
 * empêcher.
 */
@Injectable()
export class PrismaProductionDayRepository extends ProductionDayRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Une journée **ouverte** quand rien n'est écrit, jamais `null`.
   *
   * Le port l'exige, et pour une raison : un `null` obligerait chaque appelant à
   * décider ce qu'il en fait, et l'un d'eux finirait par fabriquer une journée
   * d'une manière que l'agrégat n'a pas prévue.
   */
  async load(day: ServiceDay): Promise<ProductionDay> {
    const row = await this.prisma.productionDay.findUnique({
      where: { serviceDay: day.value },
      select: DAY_COLUMNS,
    });
    if (row === null) {
      return ProductionDay.open(day);
    }
    return ProductionDay.restore(daySnapshotOf(row));
  }

  /**
   * Écrit la journée dans une seule transaction : son en-tête, puis **ce que
   * ses gestes ont changé** depuis la lecture (`ProductionDay.changes`).
   *
   * Le coût se lit dans `writeDayChanges` : un lancement de réassort n'écrit
   * plus que ce réassort et le compte, là où chaque `save` effaçait puis
   * recréait toutes les commandes, tous les comptes et tous les réassorts du
   * jour, sous `FOR UPDATE` (corrigé le 2026-11-02). La journée s'écrit à
   * l'arrêt, au retirage, à la réouverture, à chaque lancement « au plus
   * tôt » et à chaque révision de commande inscrite (vérifié le 2026-11-02).
   * Une journée dont la base n'est pas connue (`fromSnapshot`) s'écrit en
   * entier, comme avant.
   *
   * Un compte à produire enregistré sans ses commandes décrirait une journée que
   * personne ne pourrait relire ; d'où la transaction, et non trois écritures.
   *
   * 🔴 Elle prend d'abord le verrou de la journée (verrou des fournées) — la
   * même requête que `PrismaProductionDayLock`, écrite ici parce qu'elle doit
   * viser `tx`. Ce verrou-ci ne protège QUE l'écriture : il ne rend pas juste
   * un agrégat chargé avant lui. Les appelants qui décident sur la journée
   * (clôture, retirage) prennent `ProductionDayLock` dans leur unité de
   * travail PUIS la rechargent (vérifié le 2026-10-06).
   *
   * 🔴 **Le colisage de l'ancien poste est RECOPIÉ, jamais interprété.** Les
   * colonnes `packed_*` et `container_count` ne sont plus ni lues par le
   * domaine ni écrites par un geste, mais les journées colisées avant la
   * bascule les portent : une commande effacée puis recréée les recopie
   * (`carriedPacking`), une commande que le geste ne touche pas les garde.
   *
   * Les fournées ne sont ni lues ni écrites ici : elles ne dépendent pas du
   * compte, et un retirage les laisse intactes.
   */
  async save(day: ProductionDay): Promise<void> {
    const snapshot = day.toSnapshot();
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "service_day" FROM "production"."production_day"
         WHERE "service_day" = ${snapshot.serviceDay}
           FOR UPDATE`;
      const header = {
        closedAt: snapshot.closedAt,
        retakenAt: snapshot.retaken?.at ?? null,
        retakenBy: snapshot.retaken?.by ?? null,
        reopenedAt: snapshot.reopened?.at ?? null,
        reopenedBy: snapshot.reopened?.by ?? null,
        ...signerColumns(snapshot.closedBy),
        retakenByName: snapshot.retakenByName,
        packingOwner: snapshot.packingOwner,
      };
      await tx.productionDay.upsert({
        where: { serviceDay: snapshot.serviceDay },
        create: { serviceDay: snapshot.serviceDay, ...header },
        update: header,
      });
      await writeDayChanges(tx, snapshot, day.changes);
    });
  }
}
