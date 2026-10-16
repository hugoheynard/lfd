import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { CatalogRightTransferView } from "@lfd/contracts";

import { assessCatalogRightTransfer } from "../domain/catalog-right-transfer.js";
import { CatalogRightTransferReader } from "../domain/catalog-right-transfer.reader.js";
import { GetCatalogRightTransferQuery } from "./get-catalog-right-transfer.query.js";

/**
 * Lit les rôles, les dérogations et les notifications, et laisse le domaine
 * dire l'écart. Lecture seule : l'aperçu n'accorde rien — accorder se fait à
 * l'écran des rôles, un rôle à la fois.
 */
@QueryHandler(GetCatalogRightTransferQuery)
export class GetCatalogRightTransferHandler implements IQueryHandler<
  GetCatalogRightTransferQuery,
  CatalogRightTransferView
> {
  constructor(private readonly reader: CatalogRightTransferReader) {}

  async execute(): Promise<CatalogRightTransferView> {
    const [roles, overrides, unread] = await Promise.all([
      this.reader.roles(),
      this.reader.catalogOverrides(),
      this.reader.unreadLegacyNotifications(),
    ]);
    return assessCatalogRightTransfer(roles, overrides, unread);
  }
}
