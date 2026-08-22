import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import { Emplacement } from "../domain/entities/emplacement.js";
import { EmplacementRepository } from "../domain/ports/emplacement.repository.js";
import type { TableState } from "../domain/value-objects/table.js";

interface TableRow {
  number: number;
  qrCreated: boolean;
  token: string | null;
}

interface EmplacementRow {
  id: string;
  name: string;
  clickCollect: boolean;
  surPlace: boolean;
  baseUrl: string;
  tables: TableRow[];
}

function toEmplacement(row: EmplacementRow): Emplacement {
  return Emplacement.reconstitute({
    id: row.id,
    name: row.name,
    clickCollect: row.clickCollect,
    surPlace: row.surPlace,
    baseUrl: row.baseUrl,
    tables: row.tables.map((table) => ({
      number: table.number,
      qrCreated: table.qrCreated,
      token: table.token,
    })),
  });
}

function tableRows(id: string, tables: readonly TableState[]) {
  return tables.map((table) => ({
    emplacementId: id,
    number: table.number,
    qrCreated: table.qrCreated,
    token: table.token,
  }));
}

const WITH_TABLES = { tables: { orderBy: { number: "asc" } } } as const;

@Injectable()
export class PrismaEmplacementRepository extends EmplacementRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async listAll(): Promise<Emplacement[]> {
    const rows = await this.prisma.emplacement.findMany({
      orderBy: [{ name: "asc" }],
      include: WITH_TABLES,
    });
    return rows.map(toEmplacement);
  }

  /**
   * Insensible à la casse — `mode: "insensitive"` côté Postgres, pas un
   * `toLowerCase()` en mémoire : on ne lit pas la table entière pour trouver
   * un nom.
   */
  async findByName(name: string): Promise<Emplacement | null> {
    const row = await this.prisma.emplacement.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      include: WITH_TABLES,
    });
    return row === null ? null : toEmplacement(row);
  }

  async findById(id: string): Promise<Emplacement | null> {
    const row = await this.prisma.emplacement.findUnique({
      where: { id },
      include: WITH_TABLES,
    });
    return row === null ? null : toEmplacement(row);
  }

  async add(emplacement: Emplacement): Promise<void> {
    const snapshot = emplacement.snapshot();
    await this.prisma.emplacement.create({
      data: {
        id: snapshot.id,
        name: snapshot.name,
        clickCollect: snapshot.clickCollect,
        surPlace: snapshot.surPlace,
        baseUrl: snapshot.baseUrl,
        tables: {
          create: snapshot.tables.map((table) => ({
            number: table.number,
            qrCreated: table.qrCreated,
            token: table.token,
          })),
        },
      },
    });
  }

  /**
   * L'état entier, **en une transaction** : les champs et la grille de tables.
   *
   * C'était deux écritures indépendantes, et c'est ce qui rendait l'invariant
   * cassable — entre les deux, un emplacement fermé en salle gardait ses
   * tables, donc des QR imprimés qui menaient quelque part. Ici, ou tout passe
   * ou rien ne passe.
   *
   * La grille est remplacée plutôt que rapprochée ligne à ligne : elle tient en
   * quelques centaines de lignes au plus (`MAX_TABLES`), et un diff coûterait
   * plus en complexité qu'il ne gagne en écritures.
   */
  async save(emplacement: Emplacement): Promise<void> {
    const snapshot = emplacement.snapshot();
    await this.prisma.$transaction([
      this.prisma.emplacement.update({
        where: { id: snapshot.id },
        data: {
          name: snapshot.name,
          clickCollect: snapshot.clickCollect,
          surPlace: snapshot.surPlace,
          baseUrl: snapshot.baseUrl,
        },
      }),
      this.prisma.emplacementTable.deleteMany({ where: { emplacementId: snapshot.id } }),
      this.prisma.emplacementTable.createMany({
        data: tableRows(snapshot.id, snapshot.tables),
      }),
    ]);
  }

  async remove(id: string): Promise<void> {
    await this.prisma.emplacement.delete({ where: { id } });
  }
}
