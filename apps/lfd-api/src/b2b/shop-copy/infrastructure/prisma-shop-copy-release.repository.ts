import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ShopCopyReleaseRepository } from "../domain/ports/shop-copy-release.repository.js";
import { ShopCopyEntry, type ShopCopyStamp } from "../domain/shop-copy-entry.js";
import {
  ShopCopyChangedError,
  ShopCopyPublishedMeanwhileError,
} from "../domain/shop-copy-errors.js";
import { ShopCopyRelease } from "../domain/shop-copy-release.js";
import { SHOP_COPY_PUBLICATION_KEY, toColumns, toState } from "./shop-copy-rows.js";

/**
 * Adaptateur Prisma de « Publier ». Deux verrous, tous deux en base :
 *
 * - la **version** : posée sur `version = chargée` (ou créée si 0) — deux
 *   publications simultanées, la seconde n'écrit rien ;
 * - chaque **texte** : réécrit sur `revision = chargée` — un brouillon écrit
 *   pendant la publication n'est pas effacé par elle.
 */
@Injectable()
export class PrismaShopCopyReleaseRepository extends ShopCopyReleaseRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(): Promise<ShopCopyRelease> {
    const [publication, rows] = await Promise.all([
      this.prisma.shopCopyPublication.findUnique({ where: { key: SHOP_COPY_PUBLICATION_KEY } }),
      this.prisma.shopCopyEntry.findMany({
        where: { draftState: { not: "unchanged" } },
        orderBy: [{ key: "asc" }, { locale: "asc" }],
      }),
    ]);
    const entries = rows.flatMap((row) => {
      const state = toState(row);
      return state === null ? [] : [ShopCopyEntry.reconstitute(state)];
    });
    return ShopCopyRelease.of(publication?.version ?? 0, entries);
  }

  async save(release: ShopCopyRelease, stamp: ShopCopyStamp): Promise<void> {
    await this.putVersion(release, stamp);
    for (const entry of release.entries) {
      const state = entry.snapshot();
      const written = await this.prisma.shopCopyEntry.updateMany({
        where: { key: state.key, locale: state.locale, revision: state.revision },
        data: toColumns(state),
      });
      if (written.count === 0) {
        throw new ShopCopyChangedError(state.key, state.locale);
      }
    }
  }

  private async putVersion(release: ShopCopyRelease, stamp: ShopCopyStamp): Promise<void> {
    const row = { version: release.version, publishedAt: stamp.at, publishedBy: stamp.staffId };
    const written =
      release.expectedVersion === 0
        ? await this.prisma.shopCopyPublication.createMany({
            data: [{ key: SHOP_COPY_PUBLICATION_KEY, ...row }],
            skipDuplicates: true,
          })
        : await this.prisma.shopCopyPublication.updateMany({
            where: { key: SHOP_COPY_PUBLICATION_KEY, version: release.expectedVersion },
            data: row,
          });
    if (written.count === 0) {
      throw new ShopCopyPublishedMeanwhileError();
    }
  }
}
