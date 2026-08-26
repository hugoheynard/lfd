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

const LOCATIONS = "/pim/locations";
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

async function createLocation(
  over: Partial<{ name: string; clickCollect: boolean; eatIn: boolean; baseUrl: string }> = {},
): Promise<string> {
  const response = await staff()
    .post(LOCATIONS)
    .send({
      name: "Village",
      clickCollect: true,
      eatIn: false,
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
    await createLocation({ name: "Aaa" });

    expect((await listPointsOfSale())[0]?.kind).toBe("platform");
  });
});

describe("le miroir d'une boutique suit sa source", () => {
  it("naît avec elle, avec son URL et ce qu'elle offre", async () => {
    await createLocation({ name: "Village", clickCollect: true, eatIn: true });

    const shop = (await listPointsOfSale()).find((point) => point.kind === "shop");

    expect(shop?.label).toBe("Village");
    expect(shop?.baseUrl).toBe("https://order.example");
    expect([...(shop?.contexts ?? [])].sort()).toEqual(["eatIn", "takeaway"]);
  });

  /**
   * Sans ça, p-1 brancherait la matrice sur des libellés périmés : le miroir
   * deviendrait une seconde vérité, et rien ne le dirait.
   */
  it("suit un renommage et un changement de modes", async () => {
    const id = await createLocation({ name: "Village", clickCollect: true, eatIn: false });

    await staff()
      .put(`${LOCATIONS}/${id}`)
      .send({ name: "Village Neuf", eatIn: true, clickCollect: false })
      .expect(200);

    const shop = (await listPointsOfSale()).find((point) => point.id === id);
    expect(shop?.label).toBe("Village Neuf");
    expect(shop?.contexts).toEqual(["eatIn"]);
  });

  it("part avec elle", async () => {
    const id = await createLocation({ name: "Village" });

    await staff().delete(`${LOCATIONS}/${id}`).expect(200);

    expect((await listPointsOfSale()).some((point) => point.id === id)).toBe(false);
  });

  /**
   * Le refus métier et le miroir sont dans la MÊME transaction : un
   * emplacement encore vendu garde sa ligne des deux côtés, sinon la matrice
   * pointerait un point de vente disparu.
   */
  it("survit à une suppression refusée", async () => {
    const id = await createLocation({ name: "Village" });
    const category = jsonBody<{ id: string }>(
      await staff()
        .post("/pim/catalogue/categories")
        .send({ name: { fr: "Viennoiseries" } }),
    ).id;
    await staff()
      .put(`/pim/catalogue/categories/${category}/channels`)
      .send([{ locationId: id, context: "takeaway" }])
      .expect(200);

    await staff().delete(`${LOCATIONS}/${id}`).expect(409);

    expect((await listPointsOfSale()).some((point) => point.id === id)).toBe(true);
  });
});

describe("la matrice cite un point de vente", () => {
  async function sellFrom(cells: readonly { locationId: string | null; context: string }[]) {
    const category = jsonBody<{ id: string }>(
      await staff()
        .post("/pim/catalogue/categories")
        .send({ name: { fr: "Viennoiseries" } }),
    ).id;
    await staff().put(`/pim/catalogue/categories/${category}/channels`).send(cells).expect(200);
    return ctx.prisma.categoryChannel.findMany({
      where: { categoryId: category },
      select: { locationId: true, pointOfSaleId: true, contextKey: true },
    });
  }

  /**
   * ⚠️ Tranche « étendre » : personne ne LIT encore cette colonne. Le test
   * existe pour ça — une colonne écrite que rien ne relit se remplit de travers
   * en silence, et p-2 basculerait dessus sans que rien n'ait jamais vérifié.
   */
  it("remplit `point_of_sale_id` à côté de `location_id`", async () => {
    const shop = await createLocation({ name: "Village" });

    const rows = await sellFrom([{ locationId: shop, context: "takeaway" }]);

    expect(rows).toEqual([{ locationId: shop, pointOfSaleId: shop, contextKey: "takeaway" }]);
  });

  /**
   * Le cœur de la traduction : le `NULL` qui voulait dire « le B2B » devient la
   * ligne qui le dit.
   */
  it("traduit le contexte sans lieu en plateforme", async () => {
    const rows = await sellFrom([{ locationId: null, context: "b2b" }]);

    expect(rows).toEqual([{ locationId: null, pointOfSaleId: "pos_b2b", contextKey: "b2b" }]);
  });
});
