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
    await this.prisma.$transaction(async (tx) => {
      await tx.deliveryProcedure.upsert({
        where: { id: state.id },
        create: { id: state.id, companyId: state.companyId, addressId: state.addressId },
        // Rien à réécrire : l'identité d'une procédure ne change pas.
        update: {},
      });
      // Suppression PHYSIQUE des étapes retirées — l'exception écrite au JSDoc
      // de `DeliveryProcedure.removeStep`. Le mur est dans le filtre de relation.
      await tx.deliveryProcedureStep.deleteMany({
        where: {
          procedureId: state.id,
          procedure: { companyId: state.companyId },
          id: { notIn: presentIds },
        },
      });
      for (const [position, step] of state.steps.entries()) {
        const columns = { title: step.title, body: step.body, photoKey: step.photoKey, position };
        await tx.deliveryProcedureStep.upsert({
          where: { id: step.id },
          create: { id: step.id, procedureId: state.id, ...columns },
          update: columns,
        });
      }
    });
  }
}
