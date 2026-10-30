import type {
  ArticleReservationView,
  CompanyReservedArticlesView,
  MadeToOrderMarkView,
} from "@lfd/contracts";

import { CatalogItemNotFoundError } from "../../../domain/errors/catalog-not-found.error.js";
import { ReservationCompanyNotFoundError } from "../../../domain/errors/made-to-order-errors.js";
import { MadeToOrderAdminReader } from "../../../domain/ports/made-to-order-admin.reader.js";
import { GetArticleReservationHandler } from "../get-article-reservation.handler.js";
import { GetArticleReservationQuery } from "../get-article-reservation.query.js";
import { ListCompanyReservedArticlesHandler } from "../list-company-reserved-articles.handler.js";
import { ListCompanyReservedArticlesQuery } from "../list-company-reserved-articles.query.js";
import { ListMadeToOrderMarksHandler } from "../list-made-to-order-marks.handler.js";

const ARTICLE: ArticleReservationView = {
  sku: "VIE-001-1",
  name: "Croissant",
  isMadeToOrder: true,
  reservedVisibility: "hidden",
  holders: [],
};
const COMPANY_VIEW: CompanyReservedArticlesView = { own: [], principal: null };
const MARK: MadeToOrderMarkView = {
  sku: "VIE-001-1",
  isMadeToOrder: true,
  reservedVisibility: "visible_locked",
  reservationCount: 2,
};

/** Le lecteur qui connaît un article et une société, et rien d'autre. */
class OneOfEach extends MadeToOrderAdminReader {
  marks(): Promise<MadeToOrderMarkView[]> {
    return Promise.resolve([MARK]);
  }

  ofArticle(sku: string): Promise<ArticleReservationView | null> {
    return Promise.resolve(sku === ARTICLE.sku ? ARTICLE : null);
  }

  ofCompany(companyId: string): Promise<CompanyReservedArticlesView | null> {
    return Promise.resolve(companyId === "co_1" ? COMPANY_VIEW : null);
  }
}

describe("les lectures du sur mesure", () => {
  const reader = new OneOfEach();

  it("rend les réglages tels que le lecteur les donne", async () => {
    expect(await new ListMadeToOrderMarksHandler(reader).execute()).toEqual([MARK]);
  });

  it("rend le réglage d'un article connu", async () => {
    const view = await new GetArticleReservationHandler(reader).execute(
      new GetArticleReservationQuery(ARTICLE.sku),
    );
    expect(view).toEqual(ARTICLE);
  });

  it("un article absent du catalogue est un 404 nommé", async () => {
    await expect(
      new GetArticleReservationHandler(reader).execute(new GetArticleReservationQuery("X")),
    ).rejects.toBeInstanceOf(CatalogItemNotFoundError);
  });

  it("une société inconnue est un 404 nommé", async () => {
    await expect(
      new ListCompanyReservedArticlesHandler(reader).execute(
        new ListCompanyReservedArticlesQuery("co_inconnue"),
      ),
    ).rejects.toBeInstanceOf(ReservationCompanyNotFoundError);
  });
});
