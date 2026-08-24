import { Test } from "@nestjs/testing";

import { VatRateRepository } from "../../../../commerce/domain/ports/vat-rate.repository.js";
import { CatalogueReader } from "../../domain/ports/catalogue-reader.js";
import { CategoryRepository } from "../../../category/domain/ports/category.repository.js";
import { ProductRepository } from "../../../product/domain/ports/product.repository.js";
import { CategoryNotFoundError } from "../../../category/domain/errors/category-errors.js";
import { EditorialReader } from "../../../product/domain/ports/editorial-reader.js";
import { PrismaCatalogueReader } from "../prisma-catalogue-reader.js";

/** Le peu de l'agrégat que le lecteur touche : ses taux, d'un bloc. */
interface CategoryLike {
  tvaByContext: Readonly<Record<string, string>>;
}

/** Une fiche réduite à ce que la résolution regarde : sa famille, sa dérogation. */
function product(tvaByContext: Readonly<Record<string, string>> = {}) {
  return { id: "prd_1", categoryId: "cat_vien", tvaByContext };
}

async function build(
  category: CategoryLike | null,
  rates: Record<string, number>,
): Promise<CatalogueReader> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      { provide: CatalogueReader, useClass: PrismaCatalogueReader },
      {
        provide: ProductRepository,
        useValue: { listAll: () => Promise.resolve([]) },
      },
      {
        provide: CategoryRepository,
        useValue: { findById: () => Promise.resolve(category) },
      },
      {
        provide: EditorialReader,
        useValue: { findByProducts: () => Promise.resolve(new Map()) },
      },
      {
        provide: VatRateRepository,
        useValue: {
          findById: (id: string) => Promise.resolve(id in rates ? { percent: rates[id] } : null),
          listAll: () =>
            Promise.resolve(Object.entries(rates).map(([id, percent]) => ({ id, percent }))),
        },
      },
    ],
  }).compile();
  return moduleRef.get(CatalogueReader);
}

describe("PrismaCatalogueReader.vatPercents", () => {
  it("résout le TAUX par contexte depuis les taux de la catégorie", async () => {
    const reader = await build(
      { tvaByContext: { emporter: "r1", surPlace: "r2" } },
      { r1: 5.5, r2: 10 },
    );

    const rates = await reader.vatPercents([product()]);

    expect(rates.get("prd_1")).toEqual({ emporter: 5.5, surPlace: 10 });
  });

  it("laisse la DÉROGATION de la fiche gagner, contexte par contexte", async () => {
    // Le cœur de la règle : la fiche déroge en B2B et suit sa famille au
    // comptoir. Écrire la fusion à deux endroits finirait par facturer deux
    // taux différents pour le même article.
    const reader = await build(
      { tvaByContext: { emporter: "r1", b2b: "r1" } },
      { r1: 5.5, r2: 20 },
    );

    const rates = await reader.vatPercents([product({ b2b: "r2" })]);

    expect(rates.get("prd_1")).toEqual({ emporter: 5.5, b2b: 20 });
  });

  it("ne rend AUCUNE clé pour un contexte non réglé sur la catégorie", async () => {
    // L'absence de clé, plutôt qu'une clé à `null` : « non réglé » ne s'écrit
    // pas, et un appelant qui itère la carte ne voit que ce qui existe.
    const reader = await build({ tvaByContext: { emporter: "r1" } }, { r1: 5.5 });

    const rates = await reader.vatPercents([product()]);

    expect(rates.get("prd_1")).toEqual({ emporter: 5.5 });
    expect("surPlace" in (rates.get("prd_1") ?? {})).toBe(false);
  });

  it("écarte le contexte dont le taux a disparu, plutôt que d’en inventer un", async () => {
    const reader = await build(
      { tvaByContext: { emporter: "r1", surPlace: "r_parti" } },
      { r1: 5.5 },
    );

    expect((await reader.vatPercents([product()])).get("prd_1")).toEqual({ emporter: 5.5 });
  });

  /**
   * Il rendait `null/null` — exactement ce que rend une famille bien réelle
   * dont personne n'a réglé la TVA. Deux causes (un rattachement cassé / un
   * taux à régler), deux gestes, et un seul symptôme à l'écran. Le pousseur
   * Shopify, seul appelant, attrape déjà les erreurs de cette lecture et les
   * rend visibles dans son rapport plutôt que de tomber.
   */
  it("REFUSE une catégorie introuvable, au lieu de la dire non réglée", async () => {
    const reader = await build(null, {});
    await expect(reader.vatPercents([product()])).rejects.toBeInstanceOf(CategoryNotFoundError);
  });
});
