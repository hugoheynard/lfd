import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infra/database/prisma.service.js';
import { TvaRegimeInUseError } from '../domain/errors/commerce-errors.js';
import {
  TvaRegimeRepository,
  type NewTvaRegime,
  type TvaRegimeRecord,
  type TvaRegimeUpdate,
} from '../domain/ports/tva-regime.repository.js';

/** Violation de clé étrangère Prisma — le `23503` de Postgres, vu depuis l'ORM. */
function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2003'
  );
}

interface TvaRegimeRow {
  id: string;
  name: string;
  description: string;
  percent: number;
  tag: string;
}

function toRecord(row: TvaRegimeRow): TvaRegimeRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    percent: row.percent,
    tag: row.tag,
  };
}

@Injectable()
export class PrismaTvaRegimeRepository extends TvaRegimeRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listAll(): Promise<TvaRegimeRecord[]> {
    const rows = await this.prisma.tvaRegime.findMany({
      orderBy: [{ percent: 'asc' }],
    });
    return rows.map(toRecord);
  }

  async findById(id: string): Promise<TvaRegimeRecord | null> {
    const row = await this.prisma.tvaRegime.findUnique({ where: { id } });
    return row === null ? null : toRecord(row);
  }

  async findByTag(tag: string): Promise<TvaRegimeRecord | null> {
    const row = await this.prisma.tvaRegime.findUnique({ where: { tag } });
    return row === null ? null : toRecord(row);
  }

  async insert(regime: NewTvaRegime): Promise<void> {
    await this.prisma.tvaRegime.create({
      data: {
        id: regime.id,
        name: regime.name,
        description: regime.description,
        percent: regime.percent,
        tag: regime.tag,
      },
    });
  }

  async update(id: string, update: TvaRegimeUpdate): Promise<void> {
    await this.prisma.tvaRegime.update({
      where: { id },
      data: {
        name: update.name,
        description: update.description,
        percent: update.percent,
        tag: update.tag,
      },
    });
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.tvaRegime.delete({ where: { id } });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new TvaRegimeInUseError(id);
      }
      throw error;
    }
  }
}
