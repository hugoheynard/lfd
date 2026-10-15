import { CategoryNotFoundError } from "../../../category/domain/errors/category-errors.js";
import { ListProductsHandler } from "../list-products.js";
import { OneCategory, OneProduct, family, tarte } from "./audience-doubles.js";

/** La liste rend l'audience effective et sa provenance (1d du plan d'audience). */
describe("ListProductsHandler — l'audience", () => {
  it("rend l'audience de la famille quand la fiche hérite", async () => {
    const handler = new ListProductsHandler(
      new OneProduct(tarte()),
      new OneCategory(family("pro")),
    );

    const [item] = await handler.execute();

    expect(item).toMatchObject({
      audience: null,
      effectiveAudience: "pro",
      audienceInherited: true,
    });
  });

  it("rend l'audience propre de la fiche quand elle déroge", async () => {
    const handler = new ListProductsHandler(
      new OneProduct(tarte({ audience: "public" })),
      new OneCategory(family("pro")),
    );

    const [item] = await handler.execute();

    expect(item).toMatchObject({
      audience: "public",
      effectiveAudience: "public",
      audienceInherited: false,
    });
  });

  it("refuse une fiche rattachée à une famille inconnue", async () => {
    const handler = new ListProductsHandler(new OneProduct(tarte()), new OneCategory(null));

    await expect(handler.execute()).rejects.toBeInstanceOf(CategoryNotFoundError);
  });
});
