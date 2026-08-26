/**
 * E2E des **points de vente** — sur un vrai Postgres.
 *
 * Ce que seul ce niveau prouve, et qu'aucun double ne dirait : la plateforme
 * professionnelle EXISTE en base (semée au boot, pas par un écran), le miroir
 * `point_of_sale` d'une boutique suit sa source dans la même transaction —
 * création, renommage, changement de modes, suppression — et la contrainte de
 * genre tient (une plateforme n'a pas d'URL de click & collect).
 *
 * Tranche p-0, `documentation/pim/point-de-vente.md`.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const POINTS_OF_SALE = "/pim/points-of-sale";

interface PointOfSaleRow {
  readonly id: string;
  readonly kind: "shop" | "platform";
  readonly label: string;
  readonly baseUrl: string | null;
  readonly contexts: readonly string[];
}

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["http"]> =>
  ctx.http().set("Authorization", "Bearer staff-e2e");

async function listPointsOfSale(): Promise<PointOfSaleRow[]> {
  const response = await staff().get(POINTS_OF_SALE);
  expect(response.status).toBe(200);
  return jsonBody<PointOfSaleRow[]>(response);
}

async function openShop(
  over: Partial<{ label: string; contexts: string[]; baseUrl: string }> = {},
): Promise<string> {
  const response = await staff()
    .post(POINTS_OF_SALE)
    .send({
      label: "Village",
      contexts: ["takeaway"],
      baseUrl: "https://order.example",
      tableCount: 0,
      ...over,
    });
  expect(response.status).toBe(201);
  return jsonBody<{ id: string }>(response).id;
}

describe("la plateforme professionnelle existe", () => {
  /**
   * Le point de toute la tranche : le B2B se lisait comme un `NULL` dans la
   * matrice de canaux, donc aucun écran ne pouvait le montrer.
   */
  it("apparaît dans la liste, sans qu'aucun écran l'ait créée", async () => {
    const platforms = (await listPointsOfSale()).filter((point) => point.kind === "platform");

    expect(platforms).toHaveLength(1);
    expect(platforms[0]?.id).toBe("pos_b2b");
    // `null`, pas `""` : une plateforme n'a pas d'URL de click & collect, et
    // `point_of_sale_shop_has_base_url` le tient en base.
    expect(platforms[0]?.baseUrl).toBeNull();
    expect(platforms[0]?.contexts).toEqual(["b2b"]);
  });

  it("passe devant les boutiques — elle n'est pas rangée par son nom", async () => {
    await openShop({ label: "Aaa" });

    expect((await listPointsOfSale())[0]?.kind).toBe("platform");
  });
});

describe("la matrice cite un point de vente", () => {
  async function sellFrom(cells: readonly { pointOfSaleId: string; context: string }[]) {
    const category = jsonBody<{ id: string }>(
      await staff()
        .post("/pim/catalogue/categories")
        .send({ name: { fr: "Viennoiseries" } }),
    ).id;
    await staff().put(`/pim/catalogue/categories/${category}/channels`).send(cells).expect(200);
    return ctx.prisma.categoryChannel.findMany({
      where: { categoryId: category },
      select: { pointOfSaleId: true, contextKey: true },
    });
  }

  it("écrit la paire (point de vente, contexte)", async () => {
    const shop = await openShop({ label: "Village" });

    const rows = await sellFrom([{ pointOfSaleId: shop, context: "takeaway" }]);

    expect(rows).toEqual([{ pointOfSaleId: shop, contextKey: "takeaway" }]);
  });

  /**
   * Ce qui était un `NULL` porteur de sens est une ligne comme une autre : la
   * colonne `location_id` a disparu en p-3, et l'exception de forme avec elle.
   */
  it("vend depuis la plateforme sans aucune exception de forme", async () => {
    const rows = await sellFrom([{ pointOfSaleId: "pos_b2b", context: "b2b" }]);

    expect(rows).toEqual([{ pointOfSaleId: "pos_b2b", contextKey: "b2b" }]);
  });
});

describe("l'offre borne ce qu'on peut vendre", () => {
  async function sell(cells: readonly { pointOfSaleId: string; context: string }[]) {
    const category = jsonBody<{ id: string }>(
      await staff()
        .post("/pim/catalogue/categories")
        .send({ name: { fr: "Viennoiseries" } }),
    ).id;
    return staff().put(`/pim/catalogue/categories/${category}/channels`).send(cells);
  }

  /**
   * Une boutique sans salle ne vend pas « sur place ». C'était accepté, et la
   * projection fabriquait ensuite une fiche pour un lieu qui ne sert pas —
   * personne ne le voyait avant le push.
   */
  it("refuse un contexte que le point de vente n'offre pas", async () => {
    const shop = await openShop({ label: "Village", contexts: ["takeaway"] });

    const response = await sell([{ pointOfSaleId: shop, context: "eatIn" }]);

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe(
      "catalogue.channels.context_not_offered",
    );
  });

  it("accepte celui qu'il offre", async () => {
    const shop = await openShop({ label: "Village", contexts: ["takeaway", "eatIn"] });

    expect((await sell([{ pointOfSaleId: shop, context: "eatIn" }])).status).toBe(200);
  });

  /** La plateforme n'offre que le contexte racine — le reste ne se vend pas là. */
  it("refuse de vendre le comptoir depuis la plateforme", async () => {
    const response = await sell([{ pointOfSaleId: "pos_b2b", context: "takeaway" }]);

    expect(response.status).toBe(409);
  });
});
