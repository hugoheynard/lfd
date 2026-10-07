import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { DeliveryProcedure } from "../domain/entities/delivery-procedure.js";
import { DeliveryProcedureRepository } from "../domain/ports/delivery-procedure.repository.js";

/**
 * Adaptateur Prisma de la procédure de livraison.
 *
 * Il ne décide de rien : ni du nombre d'étapes, ni de l'ordre. Il traduit
 * l'état de l'agrégat — les étapes présentes, dans leur ordre — en lignes.
 *
 * **Pourquoi réécrire toutes les positions** : la table n'a pas d'unique sur
 * `(procedure_id, position)` (un unique non différé ferait échouer l'échange de
 * deux lignes), donc rien en base ne garde l'ordre cohérent. C'est cette
 * réécriture complète, à chaque enregistrement, qui le fait.
 *
 * **Le mur est dans chaque écriture** : la racine sous sa colonne
 * `company_id`, les étapes sous le filtre de relation de leur procédure. Il n'y
 * était pas avant le 2026-10-07 (`documentation/livraisons/audit-2026-10-07.md`,
 * B2) : deux `upsert` cherchaient par le seul `id`. D'où « mettre à jour sous
 * le mur, créer sinon » : un `id` déjà pris par une autre société n'est jamais
 * réécrit, sa création se heurte à la clé primaire (`P2002`, 409 par
 * `mapPersistenceError`) et la transaction entière tombe.
 */
@Injectable()
export class PrismaDeliveryProcedureRepository extends DeliveryProcedureRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async loadForAddress(companyId: string, addressId: string): Promise<DeliveryProcedure | null> {
    const row = await this.prisma.deliveryProcedure.findFirst({
      where: { companyId, addressId },
      select: {
        id: true,
        companyId: true,
        addressId: true,
        steps: {
          orderBy: { position: "asc" },
          select: { id: true, title: true, body: true, photoKey: true },
        },
      },
    });
    return row === null ? null : DeliveryProcedure.reconstitute(row);
  }

  async save(procedure: DeliveryProcedure): Promise<void> {
    const state = procedure.toPersistence();
    const presentIds = state.steps.map((step) => step.id);
    // Les étapes de CETTE procédure, de CETTE société : le mur passe par la relation.
    const wall = { procedureId: state.id, procedure: { companyId: state.companyId } };
    await this.prisma.$transaction(async (tx) => {
      // Rien à réécrire sur la racine : l'identité d'une procédure ne change pas.
      // Elle n'est créée que si cette société ne la porte pas déjà.
      const owned = await tx.deliveryProcedure.count({
        where: { id: state.id, companyId: state.companyId },
      });
      if (owned === 0) {
        await tx.deliveryProcedure.create({
          data: { id: state.id, companyId: state.companyId, addressId: state.addressId },
        });
      }
      // Suppression PHYSIQUE des étapes retirées — l'exception écrite au JSDoc
      // de `DeliveryProcedure.removeStep`.
      await tx.deliveryProcedureStep.deleteMany({ where: { ...wall, id: { notIn: presentIds } } });
      for (const [position, step] of state.steps.entries()) {
        const columns = { title: step.title, body: step.body, photoKey: step.photoKey, position };
        const { count } = await tx.deliveryProcedureStep.updateMany({
          where: { ...wall, id: step.id },
          data: columns,
        });
        if (count === 0) {
          await tx.deliveryProcedureStep.create({
            data: { id: step.id, procedureId: state.id, ...columns },
          });
        }
      }
    });
  }
}
