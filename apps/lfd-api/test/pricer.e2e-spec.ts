/**
 * E2E du **`Pricer`** — la porte d'entrée du prix, sur un vrai Postgres.
 *
 * ## Ce que seul ce niveau prouve
 *
 * Trois choses, et aucune ne s'atteint avec des ports doublés :
 *
 * 1. **L'ACCORD.** La façade et la caisse doivent annoncer le même prix sur le
 *    même article, le même client, la même quantité. C'est la propriété pour
 *    laquelle tout ce dossier existe : les deux divergences connues — 1,83924 €
 *    contre 1,65532 € sur l'écran de tarification, une courbe au tarif catalogue
 *    sur la projection — sont exactement cette égalité, prise en défaut.
 * 2. **Le BUDGET.** Dix articles doivent coûter les mêmes lectures qu'un seul.
 *    Un N+1 ne se voit jamais sur trois articles doublés ; il se voit en
 *    comptant les opérations ORM d'un vrai chargement.
 * 3. **Le MUR.** La mercuriale d'un client ne fuit pas chez un autre, et
 *    l'exclusion en base tient — deux propriétés portées par du SQL, pas par du
 *    TypeScript.
 *
 * ## Pourquoi le service, et pas une route
 *
 * Le `Pricer` n'a pas de surface HTTP, et n'a pas à en avoir : c'est une façade
 * pour du code, pas pour un client. On le tire donc de l'application bootée —
 * les vrais adaptateurs, les vraies migrations, les vraies contraintes — plutôt
 * que d'inventer une route dont personne n'aurait besoin.
 *
 * ⚠️ **La comparaison avec la caisse passe, elle, par HTTP.** C'est le point :
 * l'accord doit tenir de bout en bout, contrôleur compris, pas seulement entre
 * deux appels au même service.
 */
import { millicentsFromCents } from "@lfd/money";

import { Pricer } from "../src/b2b/pricing/application/pricer.js";
import { DuplicateArticleError } from "../src/b2b/pricing/domain/pricing-errors.js";
import { UnknownSkuError } from "../src/b2b/orders/domain/errors/order-errors.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { SchemaOpsCounter } from "../src/platform/database/schema-ops.counter.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let ctx: E2eContext;
let pricer: Pricer;
let counter: SchemaOpsCounter;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
  pricer = ctx.app.get(Pricer);
  counter = ctx.app.get(SchemaOpsCounter);
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = () => ctx.asSub(E2E_STAFF_SUB);

/** Des SKU réels du catalogue e2e — 93 articles y sont semés. */
const SKUS = [
  "VIE-001",
  "VIE-002",
  "VIE-003",
  "VIE-004",
  "VIE-005",
  "PAI-001",
  "PAI-002",
  "PAI-003",
  "PAI-004",
  "PAI-005",
] as const;

const SKU = "VIE-001";

/**
 * Le coût **à froid**, en opérations ORM, du premier appel de ce test.
 *
 * Un devis coûte quatre opérations au premier appel et une aux suivants : un
 * cache en sert trois. Mesurer à chaud comparerait deux caches, pas deux
 * lectures — c'est l'erreur que `pricing-budget.e2e-spec.ts` raconte en
 * détail, et le compteur y est le même.
 *
 * ⚠️ **Un seul appel mesuré par test.**
 */
async function coldOperationsOf(run: () => Promise<unknown>): Promise<number> {
  await ctx.drain();
  const before = counter.total();
  await run();
  await ctx.drain();
  return counter.total() - before;
}

/** Une société cliente, et une personne qui commande en son nom. */
async function customerOf(sub: string): Promise<{ companyId: string; sub: string }> {
  const company = await createCompany(ctx.prisma);
  const user = await createUser(ctx.prisma, { auth0Sub: sub });
  await attachTo(ctx.prisma, user.id, company.id);
  return { companyId: company.id, sub };
}

/** Un barème qui s'ouvre **dès la première pièce** — celui qui a produit la divergence. */
function seedLadderFromOne(id = "ladder_pricer") {
  return ctx.prisma.volumeLadder.create({
    data: {
      id,
      scopeType: "product",
      scopeId: SKU,
      audienceType: "all",
      audienceId: null,
      unit: "percent",
      tiers: [{ minQuantity: 1, value: 1_000 }],
      label: "Barème dès la première pièce",
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      createdBy: "e2e",
    },
  });
}

/** Une promotion publique de −15 %, sur tout le catalogue. */
function seedPromotion(id = "rule_pricer_promo") {
  return ctx.prisma.priceRule.create({
    data: {
      id,
      stage: "promotion",
      nature: "alter",
      scopeType: "global",
      scopeId: null,
      audienceType: "all",
      audienceId: null,
      minQuantity: null,
      direction: "decrease",
      mode: "percent",
      value: 1_500,
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validTo: null,
      label: "Promotion de printemps",
      stacksOverMercuriale: false,
      createdBy: "e2e",
    },
  });
}

/** Pose une mercuriale par la route staff — le chemin réel, contraintes comprises. */
function poseMercuriale(
  companyId: string,
  cents: number,
  window: { from: string; to: string | null } = {
    from: "2026-01-01T00:00:00.000Z",
    to: "2027-01-01T00:00:00.000Z",
  },
) {
  return staff()
    .post(`/admin/pricing/companies/${companyId}/mercuriale`)
    .send({
      label: "Mercuriale du test",
      validFrom: window.from,
      validTo: window.to,
      lines: [{ sku: SKU, unitPriceMillicents: millicentsFromCents(cents) }],
    })
    .expect(201);
}

/** Ce que la CAISSE facture, par HTTP, pour ce client et cette quantité. */
async function quotedByCheckout(
  sub: string,
  companyId: string | null,
  quantity: number,
): Promise<number | undefined> {
  const body = jsonBody<{ lines: readonly { unitPriceMillicents: number }[] }>(
    await ctx
      .asSub(sub)
      .post("/orders/quote")
      .send({ companyId, lines: [{ sku: SKU, quantity }] })
      .expect(200),
  );
  return body.lines[0]?.unitPriceMillicents;
}

/**
 * 🔴 **La façade et la caisse annoncent le MÊME prix.**
 *
 * C'est le cas qui justifie la façade entière. Il ne teste aucune valeur en
 * particulier : il exige que les deux chemins **tombent d'accord**, ce qui
 * reste vrai quels que soient les tarifs du catalogue et les règles posées.
 *
 * Les quatre cas balaient les quatre façons connues de diverger, et chacune a
 * déjà divergé une fois : l'étage oublié (barème), la mercuriale non lue, le
 * scellement mal appliqué, le palier ouvert d'un côté et pas de l'autre.
 */
describe("la façade et la caisse", () => {
  it("🔴 s'accordent quand un barème s'ouvre dès la première pièce", async () => {
    const { companyId, sub } = await customerOf("auth0|pricer_ladder");
    await seedLadderFromOne();

    const priced = await pricer.for({ sku: SKU, companyId, quantity: 1 });

    expect(priced.finalMillicents).toBe(await quotedByCheckout(sub, companyId, 1));
  });

  it("🔴 s'accordent quand le client a une mercuriale qui scelle une promotion", async () => {
    const { companyId, sub } = await customerOf("auth0|pricer_merc");
    await seedPromotion();
    await poseMercuriale(companyId, 150);

    const priced = await pricer.for({ sku: SKU, companyId, quantity: 4 });

    expect(priced.finalMillicents).toBe(millicentsFromCents(150));
    expect(priced.sealedByRuleId).not.toBeNull();
    expect(priced.finalMillicents).toBe(await quotedByCheckout(sub, companyId, 4));
  });

  it("🔴 s'accordent sur un palier de barème, à la même quantité", async () => {
    const { companyId, sub } = await customerOf("auth0|pricer_tier");
    await ctx.prisma.volumeLadder.create({
      data: {
        id: "ladder_tiers",
        scopeType: "product",
        scopeId: SKU,
        audienceType: "all",
        audienceId: null,
        unit: "percent",
        tiers: [
          { minQuantity: 10, value: 1_000 },
          { minQuantity: 50, value: 2_500 },
        ],
        label: "Barème à deux paliers",
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
        createdBy: "e2e",
      },
    });

    for (const quantity of [1, 10, 49, 50, 120]) {
      const priced = await pricer.for({ sku: SKU, companyId, quantity });
      expect([quantity, priced.finalMillicents]).toEqual([
        quantity,
        await quotedByCheckout(sub, companyId, quantity),
      ]);
    }
  });

  it("🔴 s'accordent pour un visiteur SANS société", async () => {
    await createUser(ctx.prisma, { auth0Sub: "auth0|pricer_solo" });
    await seedPromotion();

    const priced = await pricer.for({ sku: SKU, companyId: null, quantity: 3 });

    expect(priced.finalMillicents).toBe(await quotedByCheckout("auth0|pricer_solo", null, 3));
  });
});

/**
 * 🔴 **Le coût ne suit pas le nombre d'articles.**
 *
 * `forAll` charge une fois, range par portée, et résout N fois en mémoire.
 * Sans ces cas, la façade deviendrait le N+1 qu'elle prétend éviter — et
 * personne ne le verrait avant qu'un écran ne demande vingt prix.
 */
describe("le budget de la façade", () => {
  it("🔴 coûte EXACTEMENT autant pour dix articles que pour un", async () => {
    const { companyId } = await customerOf("auth0|pricer_budget");

    const one = await coldOperationsOf(() =>
      pricer.forAll({ articles: [{ sku: SKU, quantity: 2 }], companyId }),
    );

    await ctx.reset();
    const again = await customerOf("auth0|pricer_budget2");
    const ten = await coldOperationsOf(() =>
      pricer.forAll({
        articles: SKUS.map((sku) => ({ sku, quantity: 2 })),
        companyId: again.companyId,
      }),
    );

    expect(ten).toBe(one);
  });

  /**
   * Une mercuriale ne coûte **rien de plus** : c'est un objet, donc une lecture.
   * Elle a coûté une règle par article — quatre-vingt-douze lignes à relire et à
   * recoller — jusqu'au 2026-09-08.
   */
  it("ne coûte pas plus cher parce que le client a une mercuriale", async () => {
    const bare = await customerOf("auth0|pricer_bare");
    const bareCost = await coldOperationsOf(() =>
      pricer.forAll({
        articles: SKUS.map((sku) => ({ sku, quantity: 2 })),
        companyId: bare.companyId,
      }),
    );

    await ctx.reset();
    const negotiated = await customerOf("auth0|pricer_negotiated");
    await poseMercuriale(negotiated.companyId, 150);
    const negotiatedCost = await coldOperationsOf(() =>
      pricer.forAll({
        articles: SKUS.map((sku) => ({ sku, quantity: 2 })),
        companyId: negotiated.companyId,
      }),
    );

    expect(negotiatedCost).toBe(bareCost);
  });

  /** Une demande vide ne touche **pas** la base — pas même le catalogue. */
  it("ne lit rien pour une demande vide", async () => {
    const { companyId } = await customerOf("auth0|pricer_empty");

    const cost = await coldOperationsOf(() => pricer.forAll({ articles: [], companyId }));

    expect(cost).toBe(0);
  });
});

/**
 * Le **mur tenant**, sur le seul chemin où il se prouve : la base.
 *
 * Un test unitaire à ports doublés ne dirait rien ici — c'est la clause SQL qui
 * choisit la mercuriale, et c'est elle qu'on éprouve.
 */
describe("le mur, et la fenêtre", () => {
  it("🔴 ne sert pas à un client la mercuriale d'un autre", async () => {
    const mine = await customerOf("auth0|pricer_mine");
    const theirs = await customerOf("auth0|pricer_theirs");
    await poseMercuriale(theirs.companyId, 100);

    const priced = await pricer.for({ sku: SKU, companyId: mine.companyId, quantity: 1 });

    expect(priced.sealedByRuleId).toBeNull();
    expect(priced.finalMillicents).toBe(priced.canonicalMillicents);
  });

  /**
   * 🔴 **`at` relit un prix passé.**
   *
   * La mercuriale s'est fermée ; le prix d'aujourd'hui est redevenu le tarif
   * catalogue, et celui d'hier reste celui qui a été facturé. Une façade qui
   * accepterait `at` sans le lire rendrait deux fois le même chiffre — et ce
   * chiffre serait plausible, ce qui est le mode de défaillance de tout ce
   * dossier.
   */
  it("🔴 relit le prix d'une mercuriale expirée à sa propre date", async () => {
    const { companyId } = await customerOf("auth0|pricer_dated");
    await poseMercuriale(companyId, 100, {
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-02-01T00:00:00.000Z",
    });

    const today = await pricer.for({ sku: SKU, companyId, quantity: 1 });
    const back = await pricer.for({
      sku: SKU,
      companyId,
      quantity: 1,
      at: new Date("2026-01-15T09:00:00.000Z"),
    });

    expect(today.finalMillicents).toBe(today.canonicalMillicents);
    expect(back.finalMillicents).toBe(millicentsFromCents(100));
    expect(back.sealedByRuleId).not.toBeNull();
  });
});

/** Ce que la façade **refuse**, et qui doit le rester. */
describe("les refus", () => {
  it("🔴 échoue en entier sur un SKU inconnu, plutôt que de raccourcir la liste", async () => {
    const { companyId } = await customerOf("auth0|pricer_unknown");

    await expect(
      pricer.forAll({
        articles: [
          { sku: SKU, quantity: 1 },
          { sku: "SKU-QUI-N-EXISTE-PAS", quantity: 1 },
          { sku: "PAI-001", quantity: 1 },
        ],
        companyId,
      }),
    ).rejects.toBeInstanceOf(UnknownSkuError);
  });

  it("refuse le même article demandé deux fois", async () => {
    const { companyId } = await customerOf("auth0|pricer_dup");

    await expect(
      pricer.forAll({
        articles: [
          { sku: SKU, quantity: 5 },
          { sku: SKU, quantity: 5 },
        ],
        companyId,
      }),
    ).rejects.toBeInstanceOf(DuplicateArticleError);
  });
});

/**
 * La **trace** survit à la façade, sur une résolution réelle.
 *
 * Une façade qui l'aplatirait rendrait la chaîne indéfendable, et rien ne
 * rougirait : le chiffre, lui, serait juste.
 */
describe("la trace", () => {
  it("🔴 emporte les étages et les règles évincées", async () => {
    const { companyId } = await customerOf("auth0|pricer_trace");
    await seedPromotion();
    await seedLadderFromOne();

    const priced = await pricer.for({ sku: SKU, companyId, quantity: 1 });

    expect(priced.steps.map((step) => step.stage)).toEqual(["volume", "promotion"]);
    expect(priced.steps.map((step) => step.ruleId)).toEqual(["ladder_pricer", "rule_pricer_promo"]);
    // Composition, pas addition : −10 % puis −15 % font −23,5 %.
    expect(priced.finalMillicents).toBe(Math.round(priced.canonicalMillicents * 0.9 * 0.85));
  });
});
