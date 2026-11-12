import {
  type CatalogScreenView,
  hasStaffPermission,
  type MadeToOrderMarkView,
  type StaffPermission,
} from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { CatalogAdminChangeVersionReader } from "../../domain/ports/catalog-admin-change-version.reader.js";
import { CatalogScreenReader } from "../../domain/ports/catalog-screen.reader.js";
import { MadeToOrderAdminReader } from "../../domain/ports/made-to-order-admin.reader.js";
import { VersionedContents } from "../../../../platform/day-versions/versioned-contents.js";
import {
  CATALOG_SCREEN_CONTENT_KEY,
  type CatalogScreenContent,
  isCatalogScreenContent,
} from "./catalog-screen-content.js";
import { GetCatalogScreenQuery } from "./get-catalog-screen.query.js";
import { publishedCatalogViewOf } from "./published-catalog-view.js";

/** Le droit qui ouvre les marqueurs du sur mesure — celui de leur propre route. */
const MADE_TO_ORDER_READER: StaffPermission = "lfc_made_to_order:read";

/**
 * **L'écran Catalogue, lu une fois** (`plan-catalogue-du-back-office.md`,
 * § 3.1) : la vue publiée, les lignes de paramétrage et, sous leur droit, les
 * marqueurs du sur mesure.
 *
 * 🔴 Le numéro `catalog-admin` est lu AVANT les données, jamais en même temps :
 * une écriture validée entre les deux fait monter le numéro après celui que
 * l'écran retient, et le veilleur la fait relire. Lu après, il couvrirait une
 * écriture que la copie n'a pas — et l'écran la manquerait jusqu'au filet.
 *
 * La part commune à tout porteur de `lfc_catalog` est servie depuis l'objet
 * tant que le numéro ne bouge pas (§ 3.5, {@link VersionedContents}) ; les
 * marqueurs du sur mesure ne sont jamais rangés, lus à chaque appel.
 *
 * Le sur mesure se tranche ICI, pas par une surface : une route ne porte
 * qu'une surface (`lfc_catalog`), et l'écran s'ouvre sans le droit du sur
 * mesure (`versions.controller.ts` fait de même par sujet).
 */
@QueryHandler(GetCatalogScreenQuery)
export class GetCatalogScreenHandler implements IQueryHandler<
  GetCatalogScreenQuery,
  CatalogScreenView
> {
  constructor(
    private readonly versions: CatalogAdminChangeVersionReader,
    private readonly screen: CatalogScreenReader,
    private readonly madeToOrder: MadeToOrderAdminReader,
    private readonly contents: VersionedContents,
  ) {}

  async execute(query: GetCatalogScreenQuery): Promise<CatalogScreenView> {
    const version = await this.versions.versionOf();
    const [content, marks] = await Promise.all([
      this.contents.contentOf(
        CATALOG_SCREEN_CONTENT_KEY,
        version,
        () => this.contentFromBase(),
        isCatalogScreenContent,
      ),
      this.marksFor(query),
    ]);
    return { version, published: content.published, items: content.items, madeToOrder: marks };
  }

  private async contentFromBase(): Promise<CatalogScreenContent> {
    const source = await this.screen.read();
    return { published: publishedCatalogViewOf(source.published), items: source.items };
  }

  private marksFor(query: GetCatalogScreenQuery): Promise<MadeToOrderMarkView[] | null> {
    return hasStaffPermission(query.permissions, MADE_TO_ORDER_READER)
      ? this.madeToOrder.marks()
      : Promise.resolve(null);
  }
}
