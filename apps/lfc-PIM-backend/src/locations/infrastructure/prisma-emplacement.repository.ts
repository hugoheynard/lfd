import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infra/database/prisma.service.js';
import {
  EmplacementRepository,
  type EmplacementFields,
  type EmplacementRecord,
  type NewEmplacement,
} from '../domain/ports/emplacement.repository.js';
import type { TableState } from '../domain/value-objects/table.js';

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

function toRecord(row: EmplacementRow): EmplacementRecord {
  return {
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
  };
}

function tableRows(id: string, tables: readonly TableState[]) {
  return tables.map((table) => ({
    emplacementId: id,
    number: table.number,
    qrCreated: table.qrCreated,
    token: table.token,
  }));
}

@Injectable()
export class PrismaEmplacementRepository extends EmplacementRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listAll(): Promise<EmplacementRecord[]> {
    const rows = await this.prisma.emplacement.findMany({
      orderBy: [{ name: 'asc' }],
      include: { tables: { orderBy: { number: 'asc' } } },
    });
    return rows.map(toRecord);
  }

  async findById(id: string): Promise<EmplacementRecord | null> {
    const row = await this.prisma.emplacement.findUnique({
      where: { id },
      include: { tables: { orderBy: { number: 'asc' } } },
    });
    return row === null ? null : toRecord(row);
  }

  async insert(emplacement: NewEmplacement): Promise<void> {
    await this.prisma.emplacement.create({
      data: {
        id: emplacement.id,
        name: emplacement.name,
        clickCollect: emplacement.clickCollect,
        surPlace: emplacement.surPlace,
        baseUrl: emplacement.baseUrl,
        tables: {
          create: emplacement.tables.map((table) => ({
            number: table.number,
            qrCreated: table.qrCreated,
            token: table.token,
          })),
        },
      },
    });
  }

  async updateFields(id: string, fields: EmplacementFields): Promise<void> {
    await this.prisma.emplacement.update({
      where: { id },
      data: {
        name: fields.name,
        clickCollect: fields.clickCollect,
        surPlace: fields.surPlace,
        baseUrl: fields.baseUrl,
      },
    });
  }

  async replaceTables(
    id: string,
    tables: readonly TableState[],
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.emplacementTable.deleteMany({
        where: { emplacementId: id },
      }),
      this.prisma.emplacementTable.createMany({ data: tableRows(id, tables) }),
    ]);
  }

  async setTableQr(
    id: string,
    tableNumber: number,
    qrCreated: boolean,
    token: string | null,
  ): Promise<void> {
    await this.prisma.emplacementTable.update({
      where: {
        emplacementId_number: { emplacementId: id, number: tableNumber },
      },
      data: { qrCreated, token },
    });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.emplacement.delete({ where: { id } });
  }
}
