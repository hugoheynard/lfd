import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import { PointOfSaleReader } from "../domain/ports/point-of-sale.reader.js";
import { bootstrapRootPointOfSale } from "../domain/value-objects/bootstrap-point-of-sale.js";
import type { PointOfSale, PointOfSaleKind } from "../domain/value-objects/point-of-sale.js";

interface PointOfSaleRow {
  readonly id: string;
  readonly kind: PointOfSaleKind;
  readonly label: string;
  readonly baseUrl: string | null;
  readonly contexts: readonly { readonly contextKey: string }[];
}

function toPointOfSale(row: PointOfSaleRow): PointOfSale {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    baseUrl: row.baseUrl,
    contexts: row.contexts.map((offered) => offered.contextKey),
  };
}

@Injectable()
export class PrismaPointOfSaleReader extends PointOfSaleReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  /**
   * Les plateformes d'abord, puis les boutiques par libellé.
   *
   * Ce n'est pas de la présentation déguisée en tri : la plateforme est le
   * point de vente que personne ne crée et que personne ne peut retirer. La
   * mettre en tête la distingue par ce qu'elle EST, plutôt que par la place
   * qu'un nom lui donnerait — « B2B » se rangerait entre deux boutiques.
   */
  async listAll(): Promise<readonly PointOfSale[]> {
    const rows = await this.prisma.pointOfSale.findMany({
      orderBy: [{ kind: "desc" }, { label: "asc" }],
      include: { contexts: { orderBy: { contextKey: "asc" } } },
    });
    return rows.map(toPointOfSale);
  }

  /**
   * **Idempotent**, et en deux `upsert` plutôt qu'un `create` imbriqué : la
   * ligne peut exister sans son offre — quelqu'un a pu retirer le contexte,
   * pas la plateforme — et un `create` imbriqué ne rattraperait que le cas où
   * les deux manquent.
   *
   * `update: {}` : la racine est ineffaçable, pas immuable. Son libellé reste
   * réglable le jour où un écran l'ouvrira, et le boot n'a pas à le repousser
   * à sa valeur d'usine toutes les nuits.
   */
  async ensureRootPointOfSale(): Promise<void> {
    const root = bootstrapRootPointOfSale();
    await this.prisma.pointOfSale.upsert({
      where: { id: root.id },
      update: {},
      create: { id: root.id, kind: root.kind, label: root.label, baseUrl: root.baseUrl },
    });
    await this.prisma.pointOfSaleContext.upsert({
      where: {
        pointOfSaleId_contextKey: { pointOfSaleId: root.id, contextKey: root.contextKey },
      },
      update: {},
      create: { pointOfSaleId: root.id, contextKey: root.contextKey },
    });
  }
}
