import { Injectable } from '@nestjs/common';
import type { SnapshotView } from '@lfd/pim-contracts';

import { PrismaService } from '../../../infra/database/prisma.service.js';
import { ResourceNotFoundError } from '../../../shared/errors/app-error.js';
import type { ShopifyProductPayload } from './projection.js';
import { payloadColumn, readPayloadColumn } from './snapshot-payload.js';

export interface RecordSnapshotInput {
  readonly handle: string;
  readonly productId: string;
  readonly hash: string;
  readonly payload: ShopifyProductPayload;
  readonly mode: 'live' | 'dry_run';
  readonly outcome: 'pushed' | 'failed';
}

/** Un snapshot chargé pour rejeu (rollback) — son payload est déjà vérifié. */
export interface LoadedSnapshot {
  readonly id: string;
  readonly version: number;
  readonly productId: string;
  readonly payload: ShopifyProductPayload;
}

/** Le rollback vise une version qui n'existe pas pour ce handle. */
export class SnapshotNotFoundError extends ResourceNotFoundError {
  constructor(handle: string, version: number) {
    super(
      'shopify.snapshot.not_found',
      `Aucun snapshot v${version} pour « ${handle} ».`,
    );
  }
}

/**
 * L'**historique** append-only des poussées réelles (le BASE de la réconciliation).
 * Persistance seule : l'écriture d'un snapshot au push et le rollback vivent dans
 * {@link ShopifyPushService} (ce sont des poussées) ; ici on ne fait qu'inscrire et
 * relire le journal (surface lecture/écriture séparée, ISP).
 */
@Injectable()
export class ShopifySnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  /** Inscrit une nouvelle version pour le handle (numéro monotone). Retourne son id. */
  async record(input: RecordSnapshotInput): Promise<{ id: string }> {
    const version = (await this.latestVersion(input.handle)) + 1;
    const row = await this.prisma.shopifyPushSnapshot.create({
      data: {
        handle: input.handle,
        productId: input.productId,
        version,
        hash: input.hash,
        payload: payloadColumn(input.payload),
        mode: input.mode,
        outcome: input.outcome,
      },
      select: { id: true },
    });
    return { id: row.id };
  }

  /** L'historique d'un handle, la version la plus récente d'abord. */
  async history(handle: string): Promise<SnapshotView[]> {
    const rows = await this.prisma.shopifyPushSnapshot.findMany({
      where: { handle },
      orderBy: { version: 'desc' },
      select: {
        version: true,
        hash: true,
        mode: true,
        outcome: true,
        pushedAt: true,
      },
    });
    return rows.map((row) => ({
      version: row.version,
      hash: row.hash,
      mode: row.mode,
      outcome: row.outcome,
      pushedAt: row.pushedAt.toISOString(),
    }));
  }

  /** Charge une version précise pour la rejouer — payload vérifié. */
  async load(handle: string, version: number): Promise<LoadedSnapshot> {
    const row = await this.prisma.shopifyPushSnapshot.findUnique({
      where: { handle_version: { handle, version } },
      select: { id: true, version: true, productId: true, payload: true },
    });
    if (row === null) {
      throw new SnapshotNotFoundError(handle, version);
    }
    return {
      id: row.id,
      version: row.version,
      productId: row.productId,
      payload: readPayloadColumn(row.payload),
    };
  }

  private async latestVersion(handle: string): Promise<number> {
    const top = await this.prisma.shopifyPushSnapshot.findFirst({
      where: { handle },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return top?.version ?? 0;
  }
}
