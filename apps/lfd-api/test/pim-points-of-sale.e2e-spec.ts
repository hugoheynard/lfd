/**
 * E2E des **points de vente** — sur un vrai Postgres.
 *
 * Ce que seul ce niveau prouve, et qu'aucun double ne dirait : la plateforme
 * professionnelle EXISTE en base (semée au boot, pas par un écran), le miroir
 * `point_of_sale` d'une boutique suit sa source dans la même transaction —
 * création, renommage, changement de modes, suppression — et la contrainte de
 * genre tient (une plateforme n'a pas d'URL de click & collect).
 *
 * Tranche p-0, `documentation/pim/contextes-et-points-de-vente.md`.
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
      kind: "shop",
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

describe("l'offre ne se retire pas sous ce qui se vend", () => {
  // Les trois cas qui vendaient un contexte ici avant de le retirer sont partis
  // en X4 (`plan-sans-interrupteurs.md`) : la matrice des canaux ne s'écrit
  // plus par aucune route. La garde du point de vente reste — elle lit ce que
  // la matrice figée porte encore.

  /** En AJOUTER un n'a jamais posé de problème : seuls les retraits sont examinés. */
  it("laisse ajouter un contexte sans rien demander", async () => {
    const shop = await openShop({ label: "Village", contexts: ["takeaway"] });

    await staff()
      .put(`${POINTS_OF_SALE}/${shop}`)
      .send({ contexts: ["takeaway", "eatIn"] })
      .expect(200);
  });
});
