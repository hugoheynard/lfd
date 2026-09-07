import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { OrderHandover } from "../domain/entities/order-handover.js";
import { OrderHandoverRepository } from "../domain/ports/order-handover.repository.js";
import type { HandoverVia } from "../domain/services/handover.js";

/**
 * Les attestations de remise, dans le schéma `production`.
 *
 * Aucun type `Prisma.*` ne sort d'ici : `toDomain` rend l'agrégat, et c'est lui
 * qui circule au-dessus.
 */
@Injectable()
export class PrismaOrderHandoverRepository extends OrderHandoverRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByOrderId(orderId: string): Promise<OrderHandover | null> {
    const row = await this.prisma.orderHandover.findUnique({ where: { orderId } });
    return row === null ? null : toDomain(row);
  }

  /**
   * Grave l'attestation, ou rend `false` si la base en tenait déjà une.
   *
   * ⚠️ **La course se ferme sur la contrainte d'unicité, pas sur une lecture.**
   * `P2002` est donc le cas NORMAL de cette méthode, pas une anomalie : deux
   * postes au comptoir scannent le même QR à la seconde près, et la base décide.
   * On l'attrape par son code plutôt que par son message — celui-ci change de
   * version en version.
   *
   * Toute autre erreur remonte : une panne de base ne doit pas se déguiser en
   * « quelqu'un a scanné avant vous ».
   */
  async attest(handover: OrderHandover): Promise<boolean> {
    try {
      await this.prisma.orderHandover.create({
        data: {
          orderId: handover.orderId,
          reference: handover.reference,
          handedOverAt: handover.handedOverAt,
          handedOverBy: handover.handedOverBy,
          handedOverVia: handover.via,
        },
      });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) {
        return false;
      }
      throw error;
    }
  }
}

/** Une ligne du schéma `production`, telle que Prisma la rend. */
interface HandoverRow {
  readonly orderId: string;
  readonly reference: string;
  readonly handedOverAt: Date;
  readonly handedOverBy: string;
  readonly handedOverVia: string;
}

/**
 * Réhydrate l'agrégat depuis sa ligne.
 *
 * `handedOverVia` est une colonne texte : Postgres accepterait n'importe quoi,
 * et une ligne écrite à la main hors du domaine ne doit pas devenir un `via`
 * inventé en traversant le mapper. On retombe sur `manual` — l'attestation la
 * plus FAIBLE —, jamais sur `scan` : se tromper vers le bas est honnête.
 */
function toDomain(row: HandoverRow): OrderHandover {
  const via: HandoverVia = row.handedOverVia === "scan" ? "scan" : "manual";
  return OrderHandover.rehydrate(
    row.orderId,
    row.reference,
    row.handedOverAt,
    row.handedOverBy,
    via,
  );
}

/**
 * L'unicité violée, reconnue par le **code** Prisma plutôt que par son texte.
 *
 * Duck-typée, sans importer les classes d'erreur du client — même geste que
 * `prisma-appointment.repository.ts`, et pour la même raison : le type concret
 * change de version en version, le code non.
 */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && Reflect.get(error, "code") === "P2002";
}
