import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infra/database/prisma.service.js';
import {
  CategoryRepository,
  type CategoryRecord,
  type NewCategory,
} from '../domain/ports/category.repository.js';
import type { LocalizedText } from '../domain/value-objects/localized-text.js';
import type { SalesChannels } from '../domain/value-objects/sales-channels.js';
import {
  localizedColumn,
  readLocalizedColumn,
  readSalesChannelsColumn,
  salesChannelsColumn,
} from './json-readers.js';

interface CategoryRow {
  id: string;
  name: unknown;
  slug: unknown;
  parentId: string | null;
  position: number;
  isArchived: boolean;
  channelPreset: unknown;
  emporterTvaId: string | null;
  surPlaceTvaId: string | null;
}

function toRecord(row: CategoryRow): CategoryRecord {
  return {
    id: row.id,
    name: readLocalizedColumn(row.name, 'category.name'),
    slug: readLocalizedColumn(row.slug, 'category.slug'),
    parentId: row.parentId,
    position: row.position,
    isArchived: row.isArchived,
    channelPreset: readSalesChannelsColumn(
      row.channelPreset,
      'category.channelPreset',
    ),
    emporterTvaId: row.emporterTvaId,
    surPlaceTvaId: row.surPlaceTvaId,
  };
}

@Injectable()
export class PrismaCategoryRepository extends CategoryRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string): Promise<CategoryRecord | null> {
    const row = await this.prisma.category.findUnique({ where: { id } });
    return row === null ? null : toRecord(row);
  }

  async listAll(): Promise<CategoryRecord[]> {
    const rows = await this.prisma.category.findMany({
      orderBy: [{ position: 'asc' }],
    });
    return rows.map(toRecord);
  }

  async insert(category: NewCategory): Promise<void> {
    await this.prisma.category.create({
      data: {
        id: category.id,
        name: localizedColumn(category.name),
        slug: localizedColumn(category.slug),
        parentId: category.parentId,
        position: category.position,
        channelPreset: salesChannelsColumn(category.channelPreset),
      },
    });
  }

  async rename(
    id: string,
    name: LocalizedText,
    slug: LocalizedText,
  ): Promise<void> {
    await this.prisma.category.update({
      where: { id },
      data: { name: localizedColumn(name), slug: localizedColumn(slug) },
    });
  }

  async archive(id: string): Promise<void> {
    await this.prisma.category.update({
      where: { id },
      data: { isArchived: true },
    });
  }

  async setChannels(id: string, channels: SalesChannels): Promise<void> {
    await this.prisma.category.update({
      where: { id },
      data: { channelPreset: salesChannelsColumn(channels) },
    });
  }

  async setTva(
    id: string,
    emporterTvaId: string | null,
    surPlaceTvaId: string | null,
  ): Promise<void> {
    await this.prisma.category.update({
      where: { id },
      data: { emporterTvaId, surPlaceTvaId },
    });
  }

  async countActiveProducts(id: string): Promise<number> {
    return this.prisma.product.count({
      where: { categoryId: id, status: { not: 'archived' } },
    });
  }

  async nextPosition(parentId: string | null): Promise<number> {
    const last = await this.prisma.category.findFirst({
      where: { parentId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    return last === null ? 0 : last.position + 1;
  }
}
