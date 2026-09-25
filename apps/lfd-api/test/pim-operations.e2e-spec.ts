/**
 * E2E des **opérations datées** — sur un vrai Postgres
 * (`documentation/order/architecture-operations-datees.md`, lot 1).
 *
 * Ce que seul ce niveau prouve :
 * - la clé primaire tient la clé d'une opération ARCHIVÉE — `noel-2026` ne
 *   renaît pas (D9) ;
 * - les `CHECK` refusent des dates contradictoires écrites HORS du domaine,
 *   dont la fin des retraits calculée en heure de Paris par la base ;
 * - le fait du journal s'écrit dans la même transaction que l'opération ;
 * - la médiathèque refuse de retirer une image qu'une opération affiche ;
 * - le mur `pim_catalog`.
 *
 * Aucune date absolue comparée à l'horloge : les dates dérivent de
 * `daysAgo` / `serviceDay`, l'intention (« dans un mois ») plutôt que le jour.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, daysAgo, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";

/** Le jeton porteur EST le `sub` : deux personnes distinctes dans une même suite. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const OPERATIONS = "/pim/operations";
const CATEGORIES = "/pim/catalogue/categories";
const PRODUCTS = "/pim/catalogue/products";
const MEDIA = "/media";
/** Le support n'a aucun droit sur le référentiel (`ROLE_GRANTS`). */
const SUPPORT_SUB = "staff-support";

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

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub("staff-e2e");

/** Un instant dans `days` jours — l'inverse de `daysAgo`. */
const inDays = (days: number): string => daysAgo(-days);

interface OperationBody {
  readonly key: string;
  readonly state: string;
  readonly skus: readonly string[];
  readonly archivedAt: string | null;
  readonly name: { readonly fr: string };
  readonly image: { readonly url: string; readonly alt: string } | null;
  readonly orderUntil: string;
  readonly pickupFrom: string;
}

/** Annoncée dans un mois, ouverte à six semaines, close à onze, retirée la semaine d'après. */
function noel(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key: "noel-2026",
    name: { fr: "Noël" },
    lede: null,
    image: null,
    announceFrom: inDays(30),
    orderFrom: inDays(45),
    orderUntil: inDays(80),
    pickupFrom: serviceDay(78),
    pickupUntil: serviceDay(84),
    audience: "both",
    ...over,
  };
}

/** Les cinq dates seules — le `PUT …/schedule` refuse toute autre clé. */
function scheduleOf(body: Record<string, unknown>): Record<string, unknown> {
  const { announceFrom, orderFrom, orderUntil, pickupFrom, pickupUntil } = body;
  return { announceFrom, orderFrom, orderUntil, pickupFrom, pickupUntil };
}

async function read(key: string): Promise<OperationBody> {
  return jsonBody<OperationBody>(await staff().get(`${OPERATIONS}/${key}`).expect(200));
}

/** Un PNG minimal et valide, déposé dans la médiathèque. Rend son URL. */
async function depositImage(): Promise<string> {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(800, 16);
  buffer.writeUInt32BE(600, 20);
  const response = await staff().post(MEDIA).attach("file", buffer, "buche.png");
  expect(response.status).toBe(201);
  return jsonBody<{ url: string }>(response).url;
}

/** Une fiche et sa déclinaison par défaut, créées par l'API dans sa propre famille. Rend le SKU. */
async function aSku(nameFr: string): Promise<string> {
  const category = jsonBody<{ id: string }>(
    await staff()
      .post(CATEGORIES)
      .send({ name: { fr: `Famille de ${nameFr}` } })
      .expect(201),
  );
  const product = jsonBody<{ id: string }>(
    await staff()
      .post(PRODUCTS)
      .send({ name: { fr: nameFr }, kind: "made_to_order", categoryId: category.id })
      .expect(201),
  );
  const variant = await ctx.prisma.productVariant.findFirstOrThrow({
    where: { productId: product.id },
    select: { sku: true },
  });
  return variant.sku;
}

describe("préparer et lire", () => {
  it("prépare, lit, et journalise dans la même écriture", async () => {
    const created = await staff().post(OPERATIONS).send(noel()).expect(201);

    expect(jsonBody<{ key: string }>(created)).toEqual({ key: "noel-2026" });
    expect(await read("noel-2026")).toMatchObject({
      key: "noel-2026",
      state: "preparing",
      skus: [],
      archivedAt: null,
      pickupFrom: serviceDay(78),
    });
    const listed = jsonBody<readonly OperationBody[]>(await staff().get(OPERATIONS).expect(200));
    expect(listed.map((operation) => operation.key)).toEqual(["noel-2026"]);

    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "operation.prepared" },
      select: { subjectType: true, subjectId: true, payload: true },
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      subjectType: "operation",
      subjectId: "noel-2026",
      payload: { subjectLabel: "Noël", audience: "both" },
    });
  });

  it("calcule l'état à l'horloge du serveur", async () => {
    await staff()
      .post(OPERATIONS)
      .send(noel({ announceFrom: daysAgo(10), orderFrom: daysAgo(5) }))
      .expect(201);

    expect((await read("noel-2026")).state).toBe("open");
  });

  it("refuse des dates contradictoires, et ne trace rien", async () => {
    const refusal = await staff()
      .post(OPERATIONS)
      .send(noel({ orderUntil: inDays(90) }))
      .expect(400);

    expect(jsonBody<{ code: string }>(refusal).code).toBe("pim.operation.order_after_pickup_end");
    expect(
      await ctx.prisma.activityEvent.count({ where: { type: { startsWith: "operation." } } }),
    ).toBe(0);
  });

  it("répond 404 pour une clé inconnue", async () => {
    await staff().get(`${OPERATIONS}/paques`).expect(404);
  });
});

describe("modifier", () => {
  it("renomme, redate, change la clientèle et compose la sélection", async () => {
    const image = await depositImage();
    const buche = await aSku("Bûche praliné");
    const galette = await aSku("Galette");
    await staff().post(OPERATIONS).send(noel()).expect(201);
    // Une seule lecture de l'horloge : la même constante part et revient.
    const earlierClose = inDays(79);

    await staff()
      .put(`${OPERATIONS}/noel-2026/presentation`)
      .send({
        name: { fr: "Noël 2026" },
        lede: { fr: "Les bûches arrivent." },
        image: { url: image, alt: "Une bûche" },
      })
      .expect(200);
    await staff()
      .put(`${OPERATIONS}/noel-2026/schedule`)
      .send({ ...scheduleOf(noel()), orderUntil: earlierClose })
      .expect(200);
    await staff().put(`${OPERATIONS}/noel-2026/audience`).send({ audience: "pro" }).expect(200);
    await staff()
      .put(`${OPERATIONS}/noel-2026/selection`)
      .send({ skus: [galette, buche] })
      .expect(200);

    expect(await read("noel-2026")).toMatchObject({
      name: { fr: "Noël 2026" },
      image: { url: image, alt: "Une bûche" },
      orderUntil: earlierClose,
      skus: [galette, buche],
    });
    const types = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: "noel-2026" },
      orderBy: { occurredAt: "asc" },
      select: { type: true },
    });
    expect(types.map((fact) => fact.type)).toEqual([
      "operation.prepared",
      "operation.edited",
      "operation.rescheduled",
      "operation.audience_changed",
      "operation.selection_saved",
    ]);
  });

  it("refuse un SKU que le catalogue ne porte pas, et une image hors de la médiathèque", async () => {
    await staff().post(OPERATIONS).send(noel()).expect(201);

    const unknown = await staff()
      .put(`${OPERATIONS}/noel-2026/selection`)
      .send({ skus: ["XXX-404"] })
      .expect(400);
    expect(jsonBody<{ code: string }>(unknown).code).toBe("pim.operation.sku_unknown");
    await staff()
      .put(`${OPERATIONS}/noel-2026/presentation`)
      .send({
        name: { fr: "Noël" },
        lede: null,
        image: { url: "https://ailleurs.test/x.png", alt: "" },
      })
      .expect(404);
  });
});

describe("archiver — une clé ne se réemploie jamais", () => {
  it("archive, fige, et refuse la même clé à une nouvelle opération", async () => {
    await staff().post(OPERATIONS).send(noel()).expect(201);

    await staff().put(`${OPERATIONS}/noel-2026/archive`).expect(200);

    expect((await read("noel-2026")).archivedAt).not.toBeNull();
    const frozen = await staff()
      .put(`${OPERATIONS}/noel-2026/audience`)
      .send({ audience: "pro" })
      .expect(409);
    expect(jsonBody<{ code: string }>(frozen).code).toBe("pim.operation.archived");
    const reused = await staff().post(OPERATIONS).send(noel()).expect(409);
    expect(jsonBody<{ code: string }>(reused).code).toBe("pim.operation.key_taken");
    expect(await ctx.prisma.operation.count()).toBe(1);
  });
});

describe("la base tient ce que l'agrégat garantit", () => {
  /** Un `UPDATE` à la main passe à côté de l'agrégat, pas des `CHECK`. */
  it.each([
    ["une clé mal formée", { key: "Noël 2026" }, "operations_key_shape"],
    ["une clientèle inconnue", { audience: "tous" }, "operations_audience"],
    [
      "une annonce après l'ouverture",
      { announceFrom: new Date(inDays(50)) },
      "operations_announce_before_order",
    ],
    [
      "une clôture avant l'ouverture",
      { orderUntil: new Date(inDays(40)) },
      "operations_order_window",
    ],
    ["des retraits inversés", { pickupFrom: new Date(serviceDay(90)) }, "operations_pickup_window"],
    [
      "une clôture après la fin des retraits",
      { orderUntil: new Date(inDays(90)) },
      "operations_order_until_before_end",
    ],
  ])("refuse %s", async (_case, data, constraint) => {
    await staff().post(OPERATIONS).send(noel()).expect(201);

    await expect(
      ctx.prisma.operation.update({ where: { key: "noel-2026" }, data }),
    ).rejects.toThrow(new RegExp(constraint, "u"));
  });

  /** `order_from` NULL : c'est l'annonce qui ouvre, et le CHECK ne devient pas muet. */
  it("refuse une clôture avant l'annonce quand la commande ouvre dès l'annonce", async () => {
    await staff()
      .post(OPERATIONS)
      .send(noel({ orderFrom: null }))
      .expect(201);

    await expect(
      ctx.prisma.operation.update({
        where: { key: "noel-2026" },
        data: { orderUntil: new Date(inDays(20)) },
      }),
    ).rejects.toThrow(/operations_order_window/u);
  });
});

describe("la médiathèque compte l'opération parmi les porteurs", () => {
  it("refuse de retirer l'image d'une opération, et la nomme", async () => {
    const image = await depositImage();
    await staff()
      .post(OPERATIONS)
      .send(noel({ image: { url: image, alt: "Une bûche" } }))
      .expect(201);

    const carriers = await staff().get(`${MEDIA}/carriers`).query({ url: image }).expect(200);
    expect(jsonBody<unknown>(carriers)).toEqual([
      { kind: "operation", id: "noel-2026", label: "Noël" },
    ]);
    expect((await staff().delete(`${MEDIA}?url=${encodeURIComponent(image)}`)).status).toBe(409);
  });
});

describe("le mur", () => {
  it("refuse un membre du staff sans droit sur le référentiel", async () => {
    await ctx.prisma.staffUser.create({
      data: {
        firstName: "Sacha",
        lastName: "Lenoir",
        email: "support@lfc.test",
        role: "support",
        status: "active",
        auth0Id: SUPPORT_SUB,
      },
    });

    await ctx.asSub(SUPPORT_SUB).get(OPERATIONS).expect(403);
    await ctx.asSub(SUPPORT_SUB).post(OPERATIONS).send(noel()).expect(403);
    expect(await ctx.prisma.operation.count()).toBe(0);
  });
});
