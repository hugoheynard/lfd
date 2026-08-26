import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import { PointOfSale, type PointOfSaleSnapshot } from "../domain/entities/point-of-sale.js";
import {
  PointOfSaleInUseError,
  PointOfSaleLabelTakenError,
} from "../domain/errors/points-of-sale-errors.js";
import { PointOfSaleRepository } from "../domain/ports/point-of-sale.repository.js";
import { violatedConstraint } from "../../catalogue/shared/infrastructure/json-readers.js";
import type { PointOfSaleKind } from "../domain/value-objects/point-of-sale.js";
import type { TableState } from "../domain/value-objects/table.js";

interface PointOfSaleRow {
  id: string;
  kind: PointOfSaleKind;
  label: string;
  baseUrl: string | null;
  contexts: readonly { contextKey: string }[];
  tables: readonly { number: number; qrCreated: boolean; token: string | null }[];
}

function toPointOfSale(row: PointOfSaleRow): PointOfSale {
  return PointOfSale.reconstitute({
    id: row.id,
    kind: row.kind,
    label: row.label,
    baseUrl: row.baseUrl,
    contexts: row.contexts.map((offer) => offer.contextKey),
    tables: row.tables.map((table) => ({
      number: table.number,
      qrCreated: table.qrCreated,
      token: table.token,
    })),
  });
}

const WITH_DETAIL = {
  contexts: { orderBy: { contextKey: "asc" } },
  tables: { orderBy: { number: "asc" } },
} as const;

/** Les plateformes d'abord, puis les boutiques par libellé — voir le lecteur. */
const IN_READING_ORDER = [{ kind: "desc" }, { label: "asc" }] as const;

@Injectable()
export class PrismaPointOfSaleRepository extends PointOfSaleRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async listAll(): Promise<PointOfSale[]> {
    const rows = await this.prisma.pointOfSale.findMany({
      orderBy: [...IN_READING_ORDER],
      include: WITH_DETAIL,
    });
    return rows.map(toPointOfSale);
  }

  async findById(id: string): Promise<PointOfSale | null> {
    const row = await this.prisma.pointOfSale.findUnique({ where: { id }, include: WITH_DETAIL });
    return row === null ? null : toPointOfSale(row);
  }

  async add(pointOfSale: PointOfSale): Promise<void> {
    const snapshot = pointOfSale.snapshot();
    await guardLabel(snapshot.label, () =>
      this.prisma.pointOfSale.create({
        data: {
          id: snapshot.id,
          kind: snapshot.kind,
          label: snapshot.label,
          baseUrl: snapshot.baseUrl,
          contexts: { create: snapshot.contexts.map((contextKey) => ({ contextKey })) },
          tables: {
            create: snapshot.tables.map((table) => ({
              number: table.number,
              qrCreated: table.qrCreated,
              token: table.token,
            })),
          },
        },
      }),
    );
  }

  /**
   * L'état entier, **en une transaction** : les champs, l'offre et la grille.
   *
   * La grille n'est réécrite QUE si l'agrégat l'a touchée. Elle l'était à chaque
   * enregistrement : renommer un point de vente effaçait puis recréait ses
   * lignes — jetons de QR compris. Un renommage ne touche plus au papier collé
   * sur les tables.
   */
  async save(pointOfSale: PointOfSale): Promise<void> {
    const snapshot = pointOfSale.snapshot();
    await guardLabel(snapshot.label, () =>
      this.prisma.$transaction([
        this.prisma.pointOfSale.update({
          where: { id: snapshot.id },
          data: { label: snapshot.label, baseUrl: snapshot.baseUrl },
        }),
        ...this.contextOperations(snapshot),
        ...(pointOfSale.tablesChanged ? this.tableOperations(snapshot) : []),
      ]),
    );
  }

  /**
   * Réécrit l'offre. Effacer-puis-écrire : un `upsert` laisserait vivre la
   * ligne d'un contexte qu'on vient de retirer, et « plus offert » ressemblerait
   * à « inchangé ».
   */
  private contextOperations(snapshot: PointOfSaleSnapshot) {
    return [
      this.prisma.pointOfSaleContext.deleteMany({ where: { pointOfSaleId: snapshot.id } }),
      ...(snapshot.contexts.length === 0
        ? []
        : [
            this.prisma.pointOfSaleContext.createMany({
              data: snapshot.contexts.map((contextKey) => ({
                pointOfSaleId: snapshot.id,
                contextKey,
              })),
            }),
          ]),
    ];
  }

  private tableOperations(snapshot: PointOfSaleSnapshot) {
    return [
      this.prisma.pointOfSaleTable.deleteMany({ where: { pointOfSaleId: snapshot.id } }),
      this.prisma.pointOfSaleTable.createMany({ data: tableRows(snapshot.id, snapshot.tables) }),
    ];
  }

  /**
   * Le **dernier mot** sur « un point de vente vendu ne disparaît pas ».
   *
   * Le mur est la clé étrangère `Restrict` de `category_channel`, pas une
   * lecture préalable : entre un compte et la suppression, une famille peut se
   * mettre à vendre depuis ce point de vente.
   *
   * **Sans recompter.** La suppression part dans la transaction du handler ; une
   * fois l'ordre en échec, Postgres l'a avortée et toute requête suivante échoue
   * à son tour. Compter ici pour enrichir le message transformerait le refus
   * métier en 500.
   */
  async remove(id: string): Promise<void> {
    try {
      await this.prisma.pointOfSale.delete({ where: { id } });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new PointOfSaleInUseError(id);
      }
      throw error;
    }
  }
}

function tableRows(id: string, tables: readonly TableState[]) {
  return tables.map((table) => ({
    pointOfSaleId: id,
    number: table.number,
    qrCreated: table.qrCreated,
    token: table.token,
  }));
}

/** Violation de clé étrangère Prisma — le `23503` de Postgres, vu depuis l'ORM. */
function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2003";
}

/**
 * Traduit la violation de `point_of_sale_label_unique` en refus métier.
 *
 * L'index porte sur `lower(label)` : sans ça, « Village » et « village »
 * seraient deux points de vente pour la base et un seul pour qui lit l'écran.
 */
async function guardLabel<T>(label: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (violatedConstraint(error) === "point_of_sale_label_unique") {
      throw new PointOfSaleLabelTakenError(label);
    }
    throw error;
  }
}
