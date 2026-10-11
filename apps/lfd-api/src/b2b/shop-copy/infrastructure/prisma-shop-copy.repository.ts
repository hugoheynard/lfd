import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ShopCopyRepository } from "../domain/ports/shop-copy.repository.js";
import { ShopCopyEntry } from "../domain/shop-copy-entry.js";
import { ShopCopyChangedError } from "../domain/shop-copy-errors.js";
import type { ShopCopyLocale } from "../domain/shop-copy-locale.js";
import { toColumns, toState } from "./shop-copy-rows.js";

/**
 * Adaptateur Prisma d'un texte. L'écriture est conditionnée à la révision
 * chargée, en un seul ordre SQL par cas — comme les documents légaux :
 *
 * - révision chargée 0 : la ligne n'existait pas ; `createMany` +
 *   `skipDuplicates` n'insère rien si un collègue l'a créée entre-temps ;
 * - sinon : `updateMany` sur `revision = chargée`. Deux écritures sur la même
 *   révision : Postgres sérialise, la seconde ne touche rien.
 */
@Injectable()
export class PrismaShopCopyRepository extends ShopCopyRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(key: string, locale: ShopCopyLocale): Promise<ShopCopyEntry> {
    const row = await this.prisma.shopCopyEntry.findUnique({
      where: { key_locale: { key, locale } },
    });
    const state = row === null ? null : toState(row);
    return state === null
      ? ShopCopyEntry.untouched(key, locale)
      : ShopCopyEntry.reconstitute(state);
  }

  async save(entry: ShopCopyEntry): Promise<void> {
    const state = entry.snapshot();
    const loaded = state.revision - 1;
    const columns = toColumns(state);
    const written =
      loaded === 0
        ? await this.prisma.shopCopyEntry.createMany({
            data: [{ key: state.key, locale: state.locale, ...columns }],
            skipDuplicates: true,
          })
        : await this.prisma.shopCopyEntry.updateMany({
            where: { key: state.key, locale: state.locale, revision: loaded },
            data: columns,
          });
    if (written.count === 0) {
      throw new ShopCopyChangedError(state.key, state.locale);
    }
  }
}
