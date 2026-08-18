/**
 * E2E du **paramétrage du catalogue** — sur un vrai Postgres.
 *
 * Ce que seul ce niveau prouve : les refus de l'agrégat traversent le bus et le
 * filtre d'erreurs pour ressortir en 400/409, et une décision posée survit
 * réellement à l'ingestion suivante. Deux propriétés qu'un test unitaire montre
 * séparément et jamais ensemble.
 */
import { CATALOG_SNAPSHOT_VERSION, type CatalogSnapshot } from "@lfd/catalog-sync";

import { AdminTokenVerifier } from "../src/infra/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { TEST_CATALOG_SECRET } from "./setup-env.js";

/** Staff doublé : accepte n'importe quel jeton porteur comme staff synthétique. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

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
  await push(200);
});

const SKU = "VIE-001-1";

function snapshot(priceCents: number): CatalogSnapshot {
  return {
    version: CATALOG_SNAPSHOT_VERSION,
    generatedAt: "2026-08-17T08:00:00.000Z",
    categories: [
      {
        id: "cat_vien",
        name: "Viennoiseries",
        slug: "viennoiseries",
        parentId: null,
        position: 0,
        vatRatePercent: 5.5,
      },
    ],
    products: [
      {
        id: "prd_1",
        sku: "VIE-001",
        name: "Croissant",
        categoryId: "cat_vien",
        kind: "daily",
        variants: [
          {
            sku: SKU,
            name: "Croissant",
            priceCents,
            weightGrams: null,
            isDefault: true,
            position: 0,
          },
        ],
      },
    ],
  };
}

function push(priceCents: number) {
  return ctx
    .http()
    .post("/catalog/ingest")
    .set("x-lfc-catalog-secret", TEST_CATALOG_SECRET)
    .send(snapshot(priceCents));
}

/** Le staff appelle avec un jeton quelconque : le verifier est doublé. */
function asStaff() {
  return ctx.http().set("Authorization", "Bearer staff");
}

async function listOne() {
  const response = await asStaff().get("/admin/catalog");
  const [item] = jsonBody<{ length: number }[]>(response) as unknown as {
    b2bPriceCents: number | null;
    effectivePriceCents: number;
    pimPriceCents: number;
    isHidden: boolean;
    isFeatured: boolean;
    decidedBy: string | null;
  }[];
  return item;
}

describe("GET /admin/catalog", () => {
  it("rend les DEUX prix, pas seulement le résultat", async () => {
    const item = await listOne();

    expect(item?.pimPriceCents).toBe(200);
    expect(item?.b2bPriceCents).toBeNull();
    expect(item?.effectivePriceCents).toBe(200);
  });

  it("refuse un appel sans jeton staff", async () => {
    const response = await ctx.http().get("/admin/catalog");

    expect(response.status).toBe(401);
  });
});

describe("PUT /admin/catalog/:sku/price", () => {
  it("pose le prix B2B et trace son auteur", async () => {
    await asStaff().put(`/admin/catalog/${SKU}/price`).send({ priceCents: 180 }).expect(204);

    const item = await listOne();
    expect(item?.b2bPriceCents).toBe(180);
    expect(item?.effectivePriceCents).toBe(180);
    expect(item?.decidedBy).toBe("staff-e2e");
  });

  it("refuse un prix nul — le refus de l'agrégat ressort en 400", async () => {
    const response = await asStaff().put(`/admin/catalog/${SKU}/price`).send({ priceCents: 0 });

    expect(response.status).toBe(400);
  });

  /**
   * Recopier le prix du PIM créerait une négociation fantôme qui bloquerait sa
   * prochaine hausse. Le refus est **métier**, donc 409, et il nomme le geste
   * correct.
   */
  it("refuse un prix identique à celui du PIM", async () => {
    const response = await asStaff().put(`/admin/catalog/${SKU}/price`).send({ priceCents: 200 });

    expect(response.status).toBe(409);
  });

  it("rend 404 pour un article qui n'est plus au catalogue", async () => {
    const response = await asStaff().put("/admin/catalog/INCONNU/price").send({ priceCents: 180 });

    expect(response.status).toBe(404);
  });
});

describe("DELETE /admin/catalog/:sku/price", () => {
  it("ramène l'article au tarif du PIM", async () => {
    await asStaff().put(`/admin/catalog/${SKU}/price`).send({ priceCents: 180 }).expect(204);

    await asStaff().delete(`/admin/catalog/${SKU}/price`).expect(204);

    const item = await listOne();
    expect(item?.b2bPriceCents).toBeNull();
    expect(item?.effectivePriceCents).toBe(200);
  });
});

describe("visibilité et mise en avant", () => {
  it("masque puis réaffiche", async () => {
    await asStaff().put(`/admin/catalog/${SKU}/visibility`).send({ hidden: true }).expect(204);
    expect((await listOne())?.isHidden).toBe(true);

    await asStaff().put(`/admin/catalog/${SKU}/visibility`).send({ hidden: false }).expect(204);
    expect((await listOne())?.isHidden).toBe(false);
  });

  it("refuse de mettre en avant un article masqué", async () => {
    await asStaff().put(`/admin/catalog/${SKU}/visibility`).send({ hidden: true }).expect(204);

    const response = await asStaff().put(`/admin/catalog/${SKU}/featured`).send({ featured: true });

    expect(response.status).toBe(409);
  });

  it("masquer éteint la mise en avant", async () => {
    await asStaff().put(`/admin/catalog/${SKU}/featured`).send({ featured: true }).expect(204);

    await asStaff().put(`/admin/catalog/${SKU}/visibility`).send({ hidden: true }).expect(204);

    expect((await listOne())?.isFeatured).toBe(false);
  });
});

/**
 * La propriété qui justifie tout le montage à deux tables. Elle se vérifie ici
 * de bout en bout : décision posée par HTTP, push réel, décision toujours là.
 */
describe("une décision survit au push suivant", () => {
  it("garde le prix B2B quand le PIM change le sien", async () => {
    await asStaff().put(`/admin/catalog/${SKU}/price`).send({ priceCents: 180 }).expect(204);

    await push(220);

    const item = await listOne();
    expect(item?.pimPriceCents).toBe(220);
    expect(item?.b2bPriceCents).toBe(180);
    expect(item?.effectivePriceCents).toBe(180);
  });
});

/**
 * **L'historique du tarif canonique** — ce que la frise attendait pour dire le
 * vrai prix.
 *
 * Jusqu'ici, une lecture datée appliquait les décisions d'hier aux tarifs
 * d'AUJOURD'HUI : un mélange qui ressemble à un prix passé sans en être un.
 * Éprouvé de bout en bout parce que la garantie est transactionnelle — la trace
 * est écrite dans la transaction qui sauve l'article, et seule une vraie base le
 * démontre.
 */
describe("l'historique du tarif canonique", () => {
  it("trace le prix décidé, et le relit à la date où il valait", async () => {
    const before = new Date();
    await new Promise((resolve) => setTimeout(resolve, 20));

    await asStaff().put(`/admin/catalog/${SKU}/price`).send({ priceCents: 999 }).expect(204);

    const now = jsonBody<{ categories: { items: { sku: string; canonicalCents: number }[] }[] }>(
      await asStaff().get("/admin/pricing").expect(200),
    );
    expect(croissantIn(now)).toBe(999);

    // La MÊME lecture, datée d'avant la décision : le tarif d'alors.
    const past = jsonBody<{ categories: { items: { sku: string; canonicalCents: number }[] }[] }>(
      await asStaff().get(`/admin/pricing?at=${before.toISOString()}`).expect(200),
    );
    expect(croissantIn(past)).toBe(200);
  });

  /**
   * **Le chemin du PIM trace aussi.** C'est ce que le point d'écriture unique
   * garantit : l'ingestion et la décision du back-office aboutissent toutes deux
   * à `saveMany`, et aucune ne peut l'esquiver. Le `beforeEach` de cette suite
   * pousse un snapshot — il suffit donc de constater qu'une trace existe déjà.
   */
  it("trace aussi ce que le PIM pousse, sans que personne l'ait demandé", async () => {
    const rows = await ctx.prisma.catalogPriceHistory.findMany({ where: { sku: SKU } });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.priceCents).toBe(200);
    expect(rows[0]?.source).toBe("pim");
  });

  /**
   * L'histoire commence quand on l'écrit, et l'écran doit pouvoir le dire : une
   * lecture antérieure applique les décisions d'alors aux tarifs d'aujourd'hui.
   */
  it("annonce depuis quand il sait quelque chose", async () => {
    const board = jsonBody<{ canonicalHistoryStartsAt: string | null }>(
      await asStaff().get("/admin/pricing").expect(200),
    );
    const first = await ctx.prisma.catalogPriceHistory.findFirst({
      orderBy: { recordedAt: "asc" },
    });

    expect(board.canonicalHistoryStartsAt).toBe(first?.recordedAt.toISOString());
  });

  /** Sans cette garde, un push de 92 articles inchangés écrirait 92 lignes. */
  it("n'écrit rien quand le prix ne bouge pas", async () => {
    const before = await ctx.prisma.catalogPriceHistory.count({ where: { sku: SKU } });

    await asStaff().put(`/admin/catalog/${SKU}/price`).send({ priceCents: 300 }).expect(204);
    await asStaff().put(`/admin/catalog/${SKU}/price`).send({ priceCents: 300 }).expect(204);

    const after = await ctx.prisma.catalogPriceHistory.count({ where: { sku: SKU } });
    expect(after - before).toBe(1);
  });
});

/** Le croissant dans un tableau de tarification, par le SKU que la boutique vend. */
function croissantIn(board: {
  categories: { items: { sku: string; canonicalCents: number }[] }[];
}): number | undefined {
  return board.categories
    .flatMap((category) => category.items)
    .find((item) => item.sku === "VIE-001")?.canonicalCents;
}
