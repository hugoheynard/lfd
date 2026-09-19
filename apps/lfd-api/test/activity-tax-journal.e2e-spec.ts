/**
 * E2E de la **tranche fiscale** du journal (`GET /admin/activity/tax`) — plan
 * du journal d'activité, lot 4 (2026-09-19).
 *
 * Ce que seul ce niveau prouve : que la comptabilité, qui n'a pas le journal,
 * relit ce qui touche à un taux de TVA et RIEN d'autre — la tranche est dans le
 * `WHERE` réel, pages, total et ancre compris — et que le mur tient sur
 * `pim_tax:write`, exigée explicitement, pas sur le `pim_tax:read` qu'un `GET`
 * aurait demandé.
 *
 * Les taux sont créés et corrigés par la route réelle, sous l'identité du
 * comptable : l'auteur figé est celui de l'adaptateur. Les autres faits —
 * fiscaux sans route simple à rejouer, et témoins hors tranche — s'écrivent par
 * l'adaptateur réel (`ActivityRecorder`), comme `activity-pages`.
 */
import type { ActivityEventView, ActivityPageView } from "@lfd/contracts";
import type { JournalFactType } from "@lfd/contracts/journal-facts";

import { ActivityRecorder } from "../src/b2b/growth/domain/ports/activity-recorder.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const TAX_JOURNAL = "/admin/activity/tax";
const RATES = "/pim/vat-rates";
const CATEGORIES = "/pim/catalogue/categories";
const PRODUCTS = "/pim/catalogue/products";
const CONTEXTS = "/pim/sales-contexts";
const LATE_FEE = "/admin/order-late-fee";

/** Les trois rôles non-admin qui comptent ici, chacun avec sa fiche d'annuaire. */
const ACCOUNTANT = { sub: "staff-comptable", role: "comptabilite", id: "fiche-comptable" } as const;
const SALES = { sub: "staff-commercial", role: "commercial", id: "fiche-commercial" } as const;
const TECH = { sub: "staff-technique", role: "dev", id: "fiche-technique" } as const;

/** Le mot cherché — présent dans un fait fiscal ET dans des faits hors tranche. */
const WORD = "réduit";

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
  for (const person of [ACCOUNTANT, SALES, TECH]) {
    await ctx.prisma.staffUser.create({
      data: {
        id: person.id,
        firstName: "Fiche",
        lastName: person.role,
        email: `${person.role}@lfc.test`,
        role: person.role,
        status: "active",
        auth0Id: person.sub,
      },
    });
  }
});

const as = (sub: string): ReturnType<E2eContext["asSub"]> => ctx.asSub(sub);
const accountant = (): ReturnType<E2eContext["asSub"]> => as(ACCOUNTANT.sub);

let written = 0;
/** Un fait écrit par l'adaptateur réel, hors requête. */
async function fact(
  type: JournalFactType,
  subjectType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  written += 1;
  await ctx.app.get(ActivityRecorder).record({
    type,
    subjectType,
    subjectId: `${subjectType}_${String(written)}`,
    idempotencyKey: `${type}:${String(written)}`,
    payload,
  });
}

/** Un taux créé puis corrigé par le comptable, par la route réelle. */
async function rateWrittenByAccountant(name: string, percent: number): Promise<string> {
  const response = await accountant().post(RATES).send({ name, percent }).expect(201);
  const id = jsonBody<{ id: string }>(response).id;
  await accountant()
    .put(`${RATES}/${id}`)
    .send({ name, percent: percent + 1 })
    .expect(200);
  return id;
}

/**
 * Les types de la tranche, et les témoins qui n'y sont pas — chacun avec une
 * charge **conforme au catalogue des faits** (le journal est strict sous le
 * harnais), qui porte le mot cherché dans une de ses valeurs.
 *
 * Sauf la surtaxe : sa charge ne dit qu'un montant et un taux, aucun texte
 * libre ne peut y porter le mot. Elle compte dans la tranche, pas dans la
 * recherche.
 */
const APPLIED_RATE = { id: "vat_applied", name: `Taux ${WORD} appliqué` } as const;
const FISCAL_SEARCHABLE = {
  "product_category.vat_changed": {
    subjectLabel: "Rayon fiscal",
    vatByContext: { b2b: { from: null, to: APPLIED_RATE } },
  },
  "product.vat_changed": {
    subjectLabel: "Fiche fiscale",
    vatByContext: { b2b: { from: APPLIED_RATE, to: null } },
  },
  "accounting_rules.method_changed": {
    subjectLabel: "Règles comptables",
    from: `Méthode ${WORD}`,
    to: "ratio_ttc",
  },
  "sales_context.created": {
    subjectLabel: `Contexte ${WORD}`,
    key: "vat_subject",
    label: `Contexte ${WORD}`,
    active: true,
    shopifyProjected: false,
  },
} as const;
const FISCAL_BY_RECORDER = [...keysOf(FISCAL_SEARCHABLE), "order_late_fee.cleared"] as const;
const LATE_FEE_CLEARED = {
  before: { fee: { mode: "percent", bp: 500 }, vatRatePercent: 20 },
} as const;
const OUTSIDE = {
  "product_category.renamed": {
    subjectLabel: "Rayon",
    changes: { name: { from: { fr: "Rayon" }, to: { fr: `Rayon ${WORD}` } } },
  },
  "product.identity_saved": {
    subjectLabel: "Fiche",
    changes: { name: { from: { fr: "Fiche" }, to: { fr: `Rayon ${WORD}` } } },
  },
  "product_category.channels_changed": {
    subjectLabel: "Rayon",
    changes: {
      channels: {
        from: [],
        to: [
          {
            pointOfSale: { id: "pos_outside", name: `Rayon ${WORD}` },
            context: { id: "b2b", name: "B2B" },
          },
        ],
      },
    },
  },
  "order_cutoff_waiver.granted": {
    company: { id: "company_outside", name: "Client hors tranche" },
    fulfillmentDate: serviceDay(),
    reason: `Rayon ${WORD}`,
  },
  "company.identity_edited": { subjectLabel: `Rayon ${WORD}`, fields: [`Rayon ${WORD}`] },
} as const;

/** Les clés d'un objet de fixture, typées par lui. */
function keysOf<T extends object>(record: T): (keyof T & string)[] {
  return Reflect.ownKeys(record).filter((key): key is keyof T & string => typeof key === "string");
}

/**
 * Deux taux par la route (quatre faits `vat_rate.*`), cinq faits fiscaux par
 * l'adaptateur, et cinq témoins hors tranche — tous porteurs du mot cherché,
 * dont deux du référentiel, voisins immédiats des types de la tranche.
 */
async function seedJournal(): Promise<{ readonly rateId: string }> {
  const rateId = await rateWrittenByAccountant(`Taux ${WORD} test`, 5.4);
  await rateWrittenByAccountant("Taux intermédiaire test", 9.7);
  for (const type of keysOf(FISCAL_SEARCHABLE)) {
    await fact(type, "vat_subject", FISCAL_SEARCHABLE[type]);
  }
  await fact("order_late_fee.cleared", "vat_subject", LATE_FEE_CLEARED);
  for (const type of keysOf(OUTSIDE)) {
    await fact(type, "other_subject", OUTSIDE[type]);
  }
  await ctx.drain();
  return { rateId };
}

const FISCAL_TOTAL = 4 + FISCAL_BY_RECORDER.length;

async function readTax(query: Record<string, string> = {}): Promise<ActivityPageView> {
  return jsonBody<ActivityPageView>(await accountant().get(TAX_JOURNAL).query(query).expect(200));
}

const typesOf = (events: readonly ActivityEventView[]): string[] =>
  events.map((event) => event.type);

const isFiscal = (type: string): boolean =>
  type.startsWith("vat_rate.") ||
  type.startsWith("accounting_rules.") ||
  type.startsWith("sales_context.") ||
  type.startsWith("order_late_fee.") ||
  type === "product_category.vat_changed" ||
  type === "product.vat_changed" ||
  type === "product.reclassified";

describe("la tranche fiscale — ce que la comptabilité relit", () => {
  it("rend tous les faits fiscaux, et rien d'autre", async () => {
    await seedJournal();

    const page = await readTax({ limit: "200" });

    expect(page.total).toBe(FISCAL_TOTAL);
    expect(typesOf(page.events).every(isFiscal)).toBe(true);
    expect(typesOf(page.events)).toEqual(
      expect.arrayContaining(["vat_rate.created", "vat_rate.rate_changed", ...FISCAL_BY_RECORDER]),
    );
    // Le témoin : les faits hors tranche existent bien, et le journal les voit.
    const all = jsonBody<ActivityPageView>(
      await as("staff-e2e").get("/admin/activity").query({ limit: "200" }).expect(200),
    );
    expect(typesOf(all.events)).toEqual(expect.arrayContaining(keysOf(OUTSIDE)));
  });

  it("attribue au comptable les taux qu'il a posés", async () => {
    const { rateId } = await seedJournal();

    const page = await readTax({ subjectType: "vat_rate", subjectId: rateId });

    expect(typesOf(page.events)).toEqual(["vat_rate.rate_changed", "vat_rate.created"]);
    expect(page.events.map((event) => event.actorId)).toEqual([ACCOUNTANT.id, ACCOUNTANT.id]);
  });

  it("ne rend jamais un fait hors tranche, même cherché par un mot qu'il porte", async () => {
    await seedJournal();

    const found = await readTax({ q: WORD, limit: "200" });

    // Le taux créé et corrigé, puis les faits de l'adaptateur qui portent le mot.
    expect(found.total).toBe(2 + keysOf(FISCAL_SEARCHABLE).length);
    expect(typesOf(found.events).every(isFiscal)).toBe(true);
  });

  it("ignore un `module` qui voudrait l'élargir, et un type hors tranche ne rend rien", async () => {
    await seedJournal();

    const widened = await readTax({ module: "comptes", limit: "200" });
    const outside = await readTax({ type: "company.identity_edited" });
    const bySubject = await readTax({ subjectType: "other_subject" });

    expect(widened.total).toBe(FISCAL_TOTAL);
    expect(typesOf(widened.events).every(isFiscal)).toBe(true);
    expect(outside).toEqual({ events: [], nextBefore: null, total: 0, page: 1, asOf: null });
    expect(bySubject.total).toBe(0);
  });

  it("se lit par pages figées : sans doublon, et sans le fait écrit entre deux pages", async () => {
    await seedJournal();
    const all = (await readTax({ limit: "200" })).events.map((event) => event.id);

    const first = await readTax({ limit: "3", page: "1" });
    await fact("vat_rate.renamed", "vat_rate", {
      subjectLabel: "Arrivé pendant la lecture",
      from: "Taux",
      to: "Arrivé pendant la lecture",
    });
    await ctx.drain();
    const asOf = first.asOf ?? "";
    const second = await readTax({ limit: "3", page: "2", asOf });
    const third = await readTax({ limit: "3", page: "3", asOf });

    expect(first.asOf).toBe(all[0]);
    expect([first, second, third].map((page) => page.total)).toEqual([
      FISCAL_TOTAL,
      FISCAL_TOTAL,
      FISCAL_TOTAL,
    ]);
    expect([first, second, third].flatMap((page) => page.events.map((event) => event.id))).toEqual(
      all,
    );
    expect((await readTax({ page: "1" })).total).toBe(FISCAL_TOTAL + 1);
  });
});

/**
 * « Tout ce qui touche au taux » (Hugo, 2026-09-19), par les routes réelles :
 * le fait tel que le handler l'écrit, pas tel qu'une fixture l'imagine.
 */
describe("la tranche fiscale — ce qui touche au taux, par les gestes réels", () => {
  /** Une famille vendue en B2B — le contexte et son point de vente sont semés. */
  async function familySoldToProfessionals(): Promise<string> {
    const response = await as("staff-e2e")
      .post(CATEGORIES)
      .send({ name: { fr: "Viennoiseries" } })
      .expect(201);
    const id = jsonBody<{ id: string }>(response).id;
    await as("staff-e2e")
      .put(`${CATEGORIES}/${id}/channels`)
      .send([{ pointOfSaleId: "pos_b2b", context: "b2b" }])
      .expect(200);
    return id;
  }

  it("rend le taux posé pour un contexte de vente, contexte nommé", async () => {
    const category = await familySoldToProfessionals();
    const rate = await rateWrittenByAccountant("Réduit", 5.5);
    await as("staff-e2e")
      .put(`${CATEGORIES}/${category}/vat`)
      .send({ vatByContext: { b2b: rate } })
      .expect(200);

    const page = await readTax({ subjectType: "product_category", subjectId: category });

    expect(typesOf(page.events)).toEqual(["product_category.vat_changed"]);
    expect(page.events[0]?.payload).toEqual({
      subjectLabel: "Viennoiseries",
      vatByContext: { b2b: { from: null, to: { id: rate, name: "Réduit" } } },
    });
  });

  /**
   * Plan des phrases du journal, lot B (D5) : un taux renommé APRÈS le fait se
   * relit sous le nom qu'il portait ce jour-là. Le journal ne se réécrit pas.
   */
  it("garde le nom du taux du MOMENT, même renommé depuis", async () => {
    const category = await familySoldToProfessionals();
    const rate = await rateWrittenByAccountant("Réduit", 5.5);
    await as("staff-e2e")
      .put(`${CATEGORIES}/${category}/vat`)
      .send({ vatByContext: { b2b: rate } })
      .expect(200);

    await accountant()
      .put(`${RATES}/${rate}`)
      .send({ name: "Réduit alimentaire", percent: 6.5 })
      .expect(200);
    await as("staff-e2e")
      .put(`${CATEGORIES}/${category}/name`)
      .send({ name: { fr: "Viennoiseries fines" } })
      .expect(200);

    const page = await readTax({ subjectType: "product_category", subjectId: category });
    expect(page.events[0]?.payload).toEqual({
      subjectLabel: "Viennoiseries",
      vatByContext: { b2b: { from: null, to: { id: rate, name: "Réduit" } } },
    });
  });

  /**
   * Fermer un canal efface le taux du contexte fermé : le fait de TVA l'écrit
   * (2026-09-19), `channels_changed`, qui ne porte que les canaux, reste dehors.
   */
  it("rend le taux qu'efface la fermeture d'un canal, et pas le fait de canaux", async () => {
    const category = await familySoldToProfessionals();
    const rate = await rateWrittenByAccountant("Réduit", 5.5);
    await as("staff-e2e")
      .put(`${CATEGORIES}/${category}/vat`)
      .send({ vatByContext: { b2b: rate } })
      .expect(200);

    await as("staff-e2e").put(`${CATEGORIES}/${category}/channels`).send([]).expect(200);

    const page = await readTax({ subjectType: "product_category", subjectId: category });
    expect(typesOf(page.events)).toEqual([
      "product_category.vat_changed",
      "product_category.vat_changed",
    ]);
    expect(page.events[0]?.payload).toEqual({
      subjectLabel: "Viennoiseries",
      vatByContext: { b2b: { from: { id: rate, name: "Réduit" }, to: null } },
    });
  });

  /** Une fiche de la famille, créée par la route réelle. */
  async function tartIn(category: string): Promise<string> {
    const response = await as("staff-e2e")
      .post(PRODUCTS)
      .send({ name: { fr: "Tarte" }, kind: "daily", categoryId: category })
      .expect(201);
    return jsonBody<{ id: string }>(response).id;
  }

  async function saveIdentity(product: string, nameFr: string, category: string): Promise<void> {
    await as("staff-e2e")
      .put(`${PRODUCTS}/${product}/identity`)
      .send({ name: { fr: nameFr }, kind: "daily", categoryId: category })
      .expect(200);
  }

  it("rend le reclassement d'une fiche, familles de départ et d'arrivée", async () => {
    const from = await familySoldToProfessionals();
    const to = jsonBody<{ id: string }>(
      await as("staff-e2e")
        .post(CATEGORIES)
        .send({ name: { fr: "Gâteaux" } })
        .expect(201),
    ).id;
    const product = await tartIn(from);

    await saveIdentity(product, "Tarte", to);

    const page = await readTax({ subjectType: "product", subjectId: product });
    expect(typesOf(page.events)).toEqual(["product.reclassified"]);
    expect(page.events[0]?.payload).toEqual({
      subjectLabel: "Tarte",
      from: { id: from, name: "Viennoiseries" },
      to: { id: to, name: "Gâteaux" },
    });
  });

  it("ne rend pas une fiche renommée sans être reclassée", async () => {
    const category = await familySoldToProfessionals();
    const product = await tartIn(category);

    await saveIdentity(product, "Tarte aux pommes", category);

    const page = await readTax({ subjectType: "product", subjectId: product });
    expect(page.total).toBe(0);
  });

  it("ne rend pas les canaux d'une famille réglés sans toucher à un taux", async () => {
    const category = await familySoldToProfessionals();

    const page = await readTax({ subjectType: "product_category", subjectId: category });

    expect(page.total).toBe(0);
  });

  /**
   * Le type ENTIER : `sales_context.updated` n'a pas de fait dédié à la bascule
   * `active`, donc un réglage du seul libellé remonte aussi — décision écrite
   * sur `TAX_JOURNAL_SLICE`.
   */
  it("rend un contexte de vente ouvert puis réglé, même sur son seul libellé", async () => {
    const opened = { key: "traiteur", label: "Traiteur", handleSuffix: "-traiteur" };
    await as("staff-e2e")
      .post(CONTEXTS)
      .send({ ...opened, active: true, shopifyProjected: false })
      .expect(201);
    await as("staff-e2e")
      .put(`${CONTEXTS}/traiteur`)
      .send({
        ...opened,
        label: "Service traiteur",
        active: true,
        shopifyProjected: false,
        position: 9,
      })
      .expect(200);

    const page = await readTax({ subjectType: "sales_context", subjectId: "traiteur" });

    expect(typesOf(page.events)).toEqual(["sales_context.updated", "sales_context.created"]);
  });

  it("rend la surtaxe de retard posée, avec son taux", async () => {
    const fee = { fee: { mode: "amount", cents: 500 }, vatRatePercent: 20 };
    await as("staff-e2e").put(LATE_FEE).send(fee).expect(204);

    const page = await readTax({ type: "order_late_fee.set" });

    expect(page.events.map((event) => event.payload)).toEqual([{ before: null, after: fee }]);
  });
});

describe("le mur de la tranche fiscale — `pim_tax:write`, exigée explicitement", () => {
  it("s'ouvre à l'administrateur", async () => {
    await seedJournal();

    const page = jsonBody<ActivityPageView>(
      await as("staff-e2e").get(TAX_JOURNAL).query({ limit: "200" }).expect(200),
    );

    expect(page.total).toBe(FISCAL_TOTAL);
  });

  /** Ils ont `pim_tax:read` : un `GET` déduit du verbe le leur aurait ouvert. */
  it.each([
    ["commercial", SALES.sub],
    ["dev", TECH.sub],
  ])("refuse le rôle %s, qui lit les taux sans les écrire", async (_role, sub) => {
    await as(sub).get(TAX_JOURNAL).expect(403);
  });

  it("ne donne pas pour autant le journal entier à la comptabilité", async () => {
    await accountant().get("/admin/activity").expect(403);
  });
});
