import { createdBreakfast } from "../../../domain/entities/__tests__/bundle-fixtures.js";
import { BundleNotFoundError } from "../../../domain/errors/bundle-errors.js";
import {
  article,
  BREAKFAST_ARTICLES,
  FixedChoiceCatalogue,
  FixedChoiceSearch,
  InMemoryBundleReader,
  InMemoryBundles,
} from "../../commands/__tests__/bundle-doubles.js";
import { GetBundleHandler } from "../get-bundle.handler.js";
import { GetBundleQuery } from "../get-bundle.query.js";
import { ListBundlesHandler } from "../list-bundles.handler.js";
import {
  BUNDLE_CHOICE_SEARCH_LIMIT,
  SearchBundleChoicesHandler,
} from "../search-bundle-choices.handler.js";
import { SearchBundleChoicesQuery } from "../search-bundle-choices.query.js";

function reader() {
  return new InMemoryBundleReader(new InMemoryBundles([createdBreakfast()]));
}

describe("GetBundleHandler", () => {
  it("dit de chaque choix ce que le catalogue en dit aujourd'hui, inconnu compris", async () => {
    const articles = [
      ...BREAKFAST_ARTICLES.filter((entry) => !["PAI-001-1", "BOI-002-1"].includes(entry.sku)),
      article("BOI-002-1", "not_served_to_public"),
    ];
    const handler = new GetBundleHandler(reader(), new FixedChoiceCatalogue(articles));

    const view = await handler.execute(new GetBundleQuery("petit-dejeuner"));

    expect(view).toMatchObject({ key: "petit-dejeuner", status: "draft", audience: "public" });
    expect(view.groups.flatMap((group) => group.choices.map((choice) => choice.standing))).toEqual([
      "admissible",
      "admissible",
      "unknown",
      "admissible",
      "not_served_to_public",
    ]);
    expect(view.groups[1]?.choices[0]).toEqual({
      sku: "PAI-001-1",
      name: null,
      shelf: null,
      thumbnailUrl: null,
      standing: "unknown",
    });
  });

  it("refuse une clé inconnue", async () => {
    const handler = new GetBundleHandler(reader(), new FixedChoiceCatalogue([]));

    await expect(handler.execute(new GetBundleQuery("fantome"))).rejects.toThrow(
      BundleNotFoundError,
    );
  });
});

describe("ListBundlesHandler", () => {
  it("lit le catalogue une seule fois pour toutes les formules", async () => {
    const catalogue = new FixedChoiceCatalogue(BREAKFAST_ARTICLES);

    const views = await new ListBundlesHandler(reader(), catalogue).execute();

    expect(views.map((view) => view.key)).toEqual(["petit-dejeuner"]);
    expect(catalogue.asked).toHaveLength(1);
  });
});

describe("SearchBundleChoicesHandler", () => {
  it("rend les propositions du port, bornées, sans leur verdict", async () => {
    const search = new FixedChoiceSearch(BREAKFAST_ARTICLES);

    const found = await new SearchBundleChoicesHandler(search).execute(
      new SearchBundleChoicesQuery("vie"),
    );

    expect(search.lastAsk).toEqual({ term: "vie", limit: BUNDLE_CHOICE_SEARCH_LIMIT });
    expect(found[0]).toEqual({
      sku: "VIE-001-1",
      name: "Article VIE-001-1",
      shelf: "Rayon",
      thumbnailUrl: null,
    });
  });
});
