import type { SiteTableView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { SiteTablesReader } from "../domain/site-tables.reader.js";

/** Le chemin que le QR d'une table ouvre, sous la racine de la boutique. */
const TABLE_PATH = "/table/";

/**
 * Adaptateur Prisma de la lecture de la grille. L'adresse d'un QR est
 * `<CLIENT_BASE_URL>/table/<jeton>` : le jeton, unique en base, désigne seul
 * le site et la table. Aucune route ne la sert encore (pas de commande à
 * table) ; sans racine configurée, l'adresse est `null` plutôt qu'inventée.
 */
@Injectable()
export class PrismaSiteTablesReader extends SiteTablesReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {
    super();
  }

  async list(siteId: string): Promise<readonly SiteTableView[]> {
    const rows = await this.prisma.siteTable.findMany({
      where: { siteId },
      orderBy: { number: "asc" },
      select: { number: true, token: true, qrCreatedAt: true },
    });
    const root = this.config.clientBaseUrl();
    return rows.map((row) => ({
      number: row.number,
      hasQr: row.token !== null,
      qrUrl: row.token === null || root === null ? null : qrUrl(root, row.token),
      qrCreatedAt: row.qrCreatedAt === null ? null : row.qrCreatedAt.toISOString(),
    }));
  }
}

function qrUrl(root: string, token: string): string {
  return `${root.replace(/\/+$/u, "")}${TABLE_PATH}${encodeURIComponent(token)}`;
}
