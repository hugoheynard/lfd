/**
 * E2E du **paramétrage tarifaire** — sur un vrai Postgres.
 *
 * Trois choses que seul ce niveau prouve :
 *
 * 1. les refus des agrégats traversent le bus et le filtre d'erreurs pour
 *    ressortir en `400`, pas en `500` ;
 * 2. la **contrainte d'exclusion** — une garantie SQL — ressort en `409` avec une
 *    phrase que le staff peut lire, au lieu du 500 brut que Prisma remonterait ;
 * 3. l'écran affiche le prix que la **caisse** calculerait, parce qu'il passe par
 *    la même fonction et le même catalogue.
 */
import type { PricingBoardView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/infra/auth/admin-token.verifier.js";
import { PaymentGateway } from "../src/payments/domain/payment-gateway.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";

/** Staff doublé : accepte n'importe quel jeton porteur comme staff synthétique. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

/**
 * Passerelle de paiement doublée : l'intention change à chaque appel, la colonne
 * étant `@unique`. Sans ce double, poser une commande échoue — et le rapport
 * prix/volume n'a alors aucune vente à mesurer.
 */
let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    return Promise.resolve({
      id: `pi_${String(intentCounter)}`,
      clientSecret: `secret_${String(intentCounter)}`,
    });
  },
  publishableKey: () => "pk_test",
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: fakeGateway },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

/** Le point de retrait — un panier a besoin d'un acheminement pour exister. */
let pickupId = "pickup_absent";

beforeEach(async () => {
  await ctx.reset();
  const point = await ctx.prisma.pickupAddress.create({
    data: {
      label: "Labo",
      ligne1: "1 rue du Four",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  pickupId = point.id;
});

const staff = () => ctx.asSub("staff-e2e");

/** VIE-001 vaut 200 c dans le catalogue qui facture. */
const SKU = "VIE-001";
const CANONICAL = 200;
const FAMILY = "viennoiserie";

interface RuleBody {
  stage?: string;
  scope?: { type: string; id: string | null };
  audience?: { type: string; id: string | null };
  minQuantity?: number | null;
  effect?: Record<string, unknown>;
  label?: string;
  validFrom?: string;
  validTo?: string | null;
}

function ruleBody(overrides: RuleBody = {}): Record<string, unknown> {
  return {
    stage: "promotion",
    scope: { type: "global", id: null },
    audience: { type: "all", id: null },
    minQuantity: null,
    effect: { nature: "alter", direction: "decrease", mode: "percent", value: 1000 },
    label: "Promo",
    validFrom: "2026-01-01T00:00:00.000Z",
    validTo: null,
    ...overrides,
  };
}

const postRule = (overrides: RuleBody = {}) =>
  staff().post("/admin/pricing/rules").send(ruleBody(overrides));

const board = async (): Promise<PricingBoardView> =>
  jsonBody<PricingBoardView>(await staff().get("/admin/pricing"));

/** L'article VIE-001, tel que l'écran le rend. */
async function croissant(): Promise<PricingBoardView["categories"][number]["items"][number]> {
  const view = await board();
  const family = view.categories.find((category) => category.id === FAMILY);
  const item = family?.items.find((candidate) => candidate.sku === SKU);
  if (item === undefined) {
    throw new Error(`L'écran ne montre pas ${SKU} — le catalogue a changé sous le test.`);
  }
  return item;
}

/** Le prix que l'écran annonce pour VIE-001 — donc celui que la caisse ferait. */
const priceOf = async (sku: string): Promise<number> => {
  if (sku !== SKU) {
    throw new Error(`Ce test ne connaît que ${SKU}.`);
  }
  return (await croissant()).finalCents;
};

describe("poser une règle", () => {
  it("rend l'identifiant posé — l'écran en a besoin pour la retirer", async () => {
    const response = await postRule();

    expect(response.status).toBe(201);
    expect(jsonBody<{ id: string }>(response).id).not.toBe("");
  });

  /**
   * Le refus central du modèle, vu du bord : une mercuriale en pourcentage
   * suivrait les hausses du tarif de liste, ce qui n'est pas ce qui a été
   * négocié. `400`, et non un 500 qui ferait accuser l'infrastructure.
   */
  it("refuse une mercuriale en pourcentage, en 400", async () => {
    const response = await postRule({ stage: "mercuriale" });

    expect(response.status).toBe(400);
  });

  it("accepte une mercuriale qui pose un prix", async () => {
    const response = await postRule({
      stage: "mercuriale",
      effect: { nature: "replace", amountCents: 210 },
      audience: { type: "company", id: "cmp_absent" },
    });

    expect(response.status).toBe(201);
  });

  /**
   * **La porte fermée.** Une remise de volume n'est plus une règle : c'est un
   * barème, et le barème existe pour garantir ce qu'aucune règle isolée ne
   * pouvait voir — que commander plus n'accorde jamais moins. Tant que cette
   * route acceptait l'étage, on pouvait poser « 100+ à −5 % » à côté d'un barème
   * accordant −10 % dès 50, et le palier isolé l'emportait par spécificité.
   */
  it("refuse l'étage volume : il appartient au barème", async () => {
    const response = await postRule({ stage: "volume", minQuantity: 100 });

    expect(response.status).toBe(400);
  });

  it("refuse une portée « famille » sans famille", async () => {
    const response = await postRule({ scope: { type: "category", id: null } });

    expect(response.status).toBe(400);
  });

  it("refuse une fenêtre qui se ferme avant de s'ouvrir", async () => {
    const response = await postRule({ validTo: "2025-01-01T00:00:00.000Z" });

    expect(response.status).toBe(400);
  });

  /**
   * La garantie porteuse du modèle : deux règles également spécifiques au même
   * moment n'existent pas. Elle vit en SQL — ce test prouve qu'elle remonte
   * **lisible**, et non en 500 sans rapport visible avec le geste du staff.
   */
  it("refuse un doublon en 409, avec une phrase lisible", async () => {
    await postRule();

    const response = await postRule({ label: "La même, autrement nommée" });

    expect(response.status).toBe(409);
    expect(jsonBody<{ message: string }>(response).message).toContain("promotion");
  });

  /**
   * Retirer **archive** : la décision quitte l'écran, la ligne reste. Le second
   * geste répond `409` et non `404` — la règle existe toujours, elle est
   * SCELLÉE. Rendre `404` prétendrait qu'elle n'a jamais existé, ce qui est
   * exactement ce qu'on refuse de dire d'une règle qui a facturé.
   */
  it("retire une règle, puis refuse de rouvrir une décision close", async () => {
    const { id } = jsonBody<{ id: string }>(await postRule());

    expect((await staff().delete(`/admin/pricing/rules/${id}`)).status).toBe(204);
    expect((await staff().delete(`/admin/pricing/rules/${id}`)).status).toBe(409);
  });

  it("répond 404 sur une règle qui n'a jamais existé", async () => {
    expect((await staff().delete("/admin/pricing/rules/inconnue")).status).toBe(404);
  });
});

/**
 * **Le cycle de vie et son journal**, sur un vrai Postgres — c'est le seul
 * niveau qui prouve les deux choses qui comptent ici : que la contrainte
 * d'exclusion est bien devenue PARTIELLE, et que chaque geste laisse son acte.
 */
describe("suspendre, reprendre, archiver", () => {
  const pause = (id: string, reason: string | null = null) =>
    staff().post(`/admin/pricing/rules/${id}/pause`).send({ reason });

  const resume = (id: string) => staff().post(`/admin/pricing/rules/${id}/resume`).send({});

  const archive = (id: string, reason: string | null = null) =>
    staff().post(`/admin/pricing/rules/${id}/archive`).send({ reason });

  const journalOf = async (id: string): Promise<{ act: string; summary: string }[]> =>
    jsonBody<{ act: string; summary: string }[]>(
      await staff().get(`/admin/pricing/journal/rule/${id}`),
    );

  it("suspend une promotion, et le prix de vitrine remonte", async () => {
    const { id } = jsonBody<{ id: string }>(await postRule());
    const remise = await priceOf(SKU);

    expect((await pause(id, "Four en panne")).status).toBe(204);

    expect(await priceOf(SKU)).toBeGreaterThan(remise);
  });

  it("reprend, et la remise revient", async () => {
    const { id } = jsonBody<{ id: string }>(await postRule());
    const remise = await priceOf(SKU);
    await pause(id);

    expect((await resume(id)).status).toBe(204);

    expect(await priceOf(SKU)).toBe(remise);
  });

  /**
   * **La pause GARDE la place.** Sans ça, quelqu'un poserait une jumelle pendant
   * la suspension et la reprise échouerait sur un chevauchement que personne n'a
   * vu venir — la promotion deviendrait irrécupérable le jour où on veut la
   * rallumer.
   */
  it("refuse une jumelle pendant la pause — le créneau reste réservé", async () => {
    const { id } = jsonBody<{ id: string }>(await postRule());
    await pause(id);

    expect((await postRule({ label: "La même, pendant la pause" })).status).toBe(409);
  });

  /** **L'archivage REND la place** : c'est toute la différence avec la pause. */
  it("accepte une jumelle après archivage — le créneau est libéré", async () => {
    const { id } = jsonBody<{ id: string }>(await postRule());
    await archive(id);

    expect((await postRule({ label: "Celle qui la remplace" })).status).toBe(201);
  });

  it("refuse de suspendre deux fois", async () => {
    const { id } = jsonBody<{ id: string }>(await postRule());
    await pause(id);

    expect((await pause(id)).status).toBe(409);
  });

  it("refuse de reprendre ce qui n'est pas suspendu", async () => {
    const { id } = jsonBody<{ id: string }>(await postRule());

    expect((await resume(id)).status).toBe(409);
  });

  it("refuse tout geste sur une règle archivée", async () => {
    const { id } = jsonBody<{ id: string }>(await postRule());
    await archive(id);

    expect((await pause(id)).status).toBe(409);
    expect((await resume(id)).status).toBe(409);
  });

  /**
   * Le cœur de la traçabilité : la suite complète des gestes, avec leur auteur,
   * leur date et le motif écrit. C'est ce qui répond à « qui a arrêté la promo
   * du 12 août » six mois plus tard.
   */
  it("garde la suite des actes, du plus récent au plus ancien", async () => {
    const { id } = jsonBody<{ id: string }>(await postRule());
    await pause(id, "Four en panne");
    await resume(id);
    await archive(id, "Remplacée par la promo de rentrée");

    const entries = await journalOf(id);

    expect(entries.map((entry) => entry.act)).toEqual(["archived", "resumed", "paused", "posed"]);
  });

  it("nomme l'auteur et retient le motif écrit", async () => {
    const { id } = jsonBody<{ id: string }>(await postRule());
    await pause(id, "Four en panne");

    const [entry] = jsonBody<{ actor: string; reason: string | null }[]>(
      await staff().get(`/admin/pricing/journal/rule/${id}`),
    );

    expect(entry?.actor).toBe("staff-e2e");
    expect(entry?.reason).toBe("Four en panne");
  });

  /**
   * La phrase est FIGÉE à l'écriture : elle doit rester lisible après que la
   * règle a quitté l'écran, sans quoi le journal renverrait à un vide.
   */
  it("garde une phrase lisible même après archivage", async () => {
    const { id } = jsonBody<{ id: string }>(await postRule());
    await archive(id);

    const [entry] = await journalOf(id);

    expect(entry?.summary).toContain("Promotion");
  });

  /**
   * Le motif est ce qu'on relira ; il doit donc pouvoir être écrit AU MOMENT du
   * geste, y compris sur une limite. Un `DELETE` ne porte pas de corps de façon
   * fiable — d'où une route `POST .../archive` à côté de lui.
   */
  it("archive une limite avec son motif, et le journal le garde", async () => {
    await staff()
      .put("/admin/pricing/floors")
      .send({ scope: { type: "global", id: null }, mode: "percent", value: 5_000, dynamic: null });

    const archived = await staff()
      .post("/admin/pricing/floors/global/archive")
      .send({ reason: "Le tarif a changé, la limite n'a plus de sens" });

    expect(archived.status).toBe(204);
    const [entry] = jsonBody<{ act: string; reason: string | null }[]>(
      await staff().get("/admin/pricing/journal/floor/global%3A"),
    );
    expect(entry?.act).toBe("archived");
    expect(entry?.reason).toContain("plus de sens");
  });

  const archivedList = async (): Promise<{ id: string; status: string }[]> =>
    jsonBody<{ id: string; status: string }[]>(await staff().get("/admin/pricing/rules/archived"));

  /**
   * Ranger sert à ne plus voir : une règle archivée quitte le TABLEAU. Si elle y
   * restait, la colonne des prix résolus dirait la vérité pendant que le nœud
   * d'à côté afficherait une règle qui n'agit plus.
   */
  it("retire la règle archivée du tableau", async () => {
    const { id } = jsonBody<{ id: string }>(await postRule());
    await archive(id);

    const view = await board();

    expect(view.globalRules.map((rule) => rule.id)).not.toContain(id);
  });

  it("la retrouve dans les archives, avec son état", async () => {
    const { id } = jsonBody<{ id: string }>(await postRule());
    await archive(id, "Doublon");

    const archives = await archivedList();

    expect(archives.map((rule) => rule.id)).toContain(id);
    expect(archives.find((rule) => rule.id === id)?.status).toBe("archived");
  });

  /** Les archives ne montrent QUE ce qui est rangé — sinon ce serait le tableau. */
  it("ne montre pas les règles encore en vigueur", async () => {
    const { id } = jsonBody<{ id: string }>(await postRule());

    expect((await archivedList()).map((rule) => rule.id)).not.toContain(id);
  });

  it("n'y range pas non plus une règle seulement suspendue", async () => {
    const { id } = jsonBody<{ id: string }>(await postRule());
    await pause(id);

    expect((await archivedList()).map((rule) => rule.id)).not.toContain(id);
  });

  /**
   * « Jamais sous 1,50 € » sur tout le catalogue laisserait passer une pièce
   * montée à 1,50 € et relèverait un croissant qui se vend 2,00 €. Le refus
   * traverse le bus et ressort en 400, pas en 500.
   */
  it("refuse une limite en euros sur tout le catalogue", async () => {
    const response = await staff()
      .put("/admin/pricing/floors")
      .send({ scope: { type: "global", id: null }, mode: "amount", value: 150, dynamic: null });

    expect(response.status).toBe(400);
  });

  it("refuse une limite en euros sur une famille", async () => {
    const response = await staff()
      .put("/admin/pricing/floors")
      .send({
        scope: { type: "category", id: FAMILY },
        mode: "amount",
        value: 150,
        dynamic: null,
      });

    expect(response.status).toBe(400);
  });

  it("accepte la même limite en pourcentage", async () => {
    const response = await staff()
      .put("/admin/pricing/floors")
      .send({
        scope: { type: "category", id: FAMILY },
        mode: "percent",
        value: 6_000,
        dynamic: null,
      });

    expect(response.status).toBe(204);
  });

  /** Sur un ARTICLE, le montant reprend tout son sens : on sait de quoi on parle. */
  it("accepte une limite en euros sur un article", async () => {
    const response = await staff()
      .put("/admin/pricing/floors")
      .send({
        scope: { type: "product", id: SKU },
        mode: "amount",
        value: 150,
        dynamic: null,
      });

    expect(response.status).toBe(204);
  });

  /**
   * Deux altérations du catalogue qui se recouvrent : personne ne l'a décidé —
   * chacune a été posée pour de bonnes raisons — et le client paie le cumul.
   * L'écran doit le voir avant lui.
   */
  it("signale deux altérations du catalogue qui se recouvrent", async () => {
    await postRule({
      stage: "promotion",
      label: "Promo de rentrée",
      effect: { nature: "alter", direction: "decrease", mode: "percent", value: 2_000 },
      validFrom: "2026-08-01T00:00:00.000Z",
      validTo: "2026-08-20T00:00:00.000Z",
    });
    await postRule({
      stage: "geste",
      label: "Geste de fin de mois",
      effect: { nature: "alter", direction: "decrease", mode: "percent", value: 1_000 },
      validFrom: "2026-08-15T00:00:00.000Z",
      validTo: "2026-08-30T00:00:00.000Z",
    });

    const [overlap] = (await board()).globalOverlaps;

    expect(overlap?.from).toBe("2026-08-15T00:00:00.000Z");
    expect(overlap?.to).toBe("2026-08-20T00:00:00.000Z");
    // −20 % puis −10 % font −28 %, pas −30 % : le cumul est un PRODUIT.
    expect(overlap?.composedBp).toBe(2_800);
    expect(overlap?.kind).toBe("compose");
  });

  /** Une règle suspendue ne recouvre rien : elle n'agit plus. */
  it("cesse de signaler le recouvrement dès qu'une des deux est suspendue", async () => {
    const { id } = jsonBody<{ id: string }>(
      await postRule({
        stage: "promotion",
        validFrom: "2026-08-01T00:00:00.000Z",
        validTo: "2026-08-20T00:00:00.000Z",
      }),
    );
    await postRule({
      stage: "geste",
      label: "Geste",
      validFrom: "2026-08-15T00:00:00.000Z",
      validTo: "2026-08-30T00:00:00.000Z",
    });
    expect((await board()).globalOverlaps).toHaveLength(1);

    await staff().post(`/admin/pricing/rules/${id}/pause`).send({ reason: null });

    expect((await board()).globalOverlaps).toEqual([]);
  });

  const putLadder = (
    tiers: { minQuantity: number; value: number }[],
    over: Record<string, unknown> = {},
  ) =>
    staff()
      .put("/admin/pricing/volume-ladders")
      .send({
        scope: { type: "product", id: SKU },
        audience: { type: "all", id: null },
        unit: "percent",
        tiers,
        label: "Barème croissant",
        validFrom: "2026-01-01T00:00:00.000Z",
        validTo: null,
        ...over,
      });

  it("pose un barème de volume", async () => {
    const response = await putLadder([
      { minQuantity: 50, value: 500 },
      { minQuantity: 100, value: 1_000 },
    ]);

    expect(response.status).toBe(201);
  });

  /**
   * **Le refus qui justifie l'échelle.** Deux règles indépendantes ne pouvaient
   * pas le porter : chacune, prise seule, est parfaitement valide.
   */
  it("refuse un barème où commander plus rapporte moins", async () => {
    const response = await putLadder([
      { minQuantity: 50, value: 1_000 },
      { minQuantity: 100, value: 500 },
    ]);

    expect(response.status).toBe(400);
  });

  /**
   * **Deux barèmes ne se recouvrent jamais sur la même cible.** C'est la
   * contrainte d'exclusion qui parle, et elle ressort lisible plutôt qu'en 500.
   */
  it("refuse un second barème qui recouvre le premier", async () => {
    await putLadder([{ minQuantity: 50, value: 500 }]);

    const response = await putLadder([{ minQuantity: 50, value: 800 }], {
      label: "Le doublon",
    });

    expect(response.status).toBe(409);
  });

  it("accepte un barème qui prend la suite du précédent", async () => {
    await putLadder([{ minQuantity: 50, value: 500 }], {
      validFrom: "2026-01-01T00:00:00.000Z",
      validTo: "2026-09-01T00:00:00.000Z",
    });

    const response = await putLadder([{ minQuantity: 50, value: 800 }], {
      label: "Barème de septembre",
      validFrom: "2026-09-01T00:00:00.000Z",
    });

    expect(response.status).toBe(201);
  });

  /**
   * La grille que le commercial lit au téléphone : chaque ligne est une
   * résolution complète à la quantité du palier, pas un « canonique moins la
   * remise » — VIE-001 vaut 200 c, donc 100+ à −10 % font 180 c.
   */
  it("rend le prix de CHAQUE palier sur l'écran", async () => {
    await putLadder([
      { minQuantity: 50, value: 500 },
      { minQuantity: 100, value: 1_000 },
    ]);

    const tiers = (await croissant()).volumeTiers;

    expect(tiers).toEqual([
      { minQuantity: 50, unitPriceCents: 190, discountBp: 500 },
      { minQuantity: 100, unitPriceCents: 180, discountBp: 1_000 },
    ]);
  });

  it("refuse un sujet de journal inventé", async () => {
    expect((await staff().get("/admin/pricing/journal/licorne/x")).status).toBe(400);
  });
});

describe("poser une limite", () => {
  const putFloor = (scope: { type: string; id: string | null }, mode: string, value: number) =>
    staff().put("/admin/pricing/floors").send({ scope, mode, value });

  it("pose une limite globale", async () => {
    expect((await putFloor({ type: "global", id: null }, "percent", 5_000)).status).toBe(204);
  });

  /** Idempotent par portée : re-poser REMPLACE, il n'y a jamais deux limites. */
  it("re-poser sur la même portée remplace au lieu d'empiler", async () => {
    await putFloor({ type: "global", id: null }, "percent", 5_000);
    await putFloor({ type: "global", id: null }, "percent", 6_000);

    expect(await ctx.prisma.priceFloor.count()).toBe(1);
    expect((await board()).globalFloor?.value).toBe(6_000);
  });

  /**
   * Au-delà de 100 %, ce n'est plus un plancher : ça relèverait tous les prix,
   * y compris ceux qu'aucune règle n'a touchés.
   */
  it("refuse une fraction supérieure au prix canonique", async () => {
    expect((await putFloor({ type: "global", id: null }, "percent", 12_000)).status).toBe(400);
  });

  it("retire une limite par sa portée, puis refuse de la retirer deux fois", async () => {
    await putFloor({ type: "category", id: FAMILY }, "percent", 5_000);

    expect((await staff().delete(`/admin/pricing/floors/category/${FAMILY}`)).status).toBe(204);
    expect((await staff().delete(`/admin/pricing/floors/category/${FAMILY}`)).status).toBe(404);
  });

  /**
   * La portée globale ne désigne aucune cible : son chemin n'en porte pas. Un
   * segment VIDE ne s'apparie pas — le premier essai l'avait supposé et prenait
   * un 404 qui accusait la donnée alors que c'était le routage.
   */
  it("retire la limite globale par un chemin sans cible", async () => {
    await putFloor({ type: "global", id: null }, "percent", 5_000);

    expect((await staff().delete("/admin/pricing/floors/global")).status).toBe(204);
  });
});

describe("l'écran de tarification", () => {
  it("montre le prix canonique quand rien n'est posé", async () => {
    const item = await croissant();

    expect(item.canonicalCents).toBe(CANONICAL);
    expect(item.finalCents).toBe(CANONICAL);
    expect(item.steps).toEqual([]);
  });

  it("montre la trace, étage par étage", async () => {
    await postRule({ label: "Promo de rentrée" });

    const item = await croissant();

    expect(item.steps).toHaveLength(1);
    expect(item.steps[0]).toMatchObject({
      stage: "promotion",
      label: "Promo de rentrée",
      resultCents: 180,
    });
    expect(item.finalCents).toBe(180);
  });

  it("range la règle de famille sur la famille, pas sur l'article", async () => {
    await postRule({ scope: { type: "category", id: FAMILY } });

    const view = await board();
    const family = view.categories.find((category) => category.id === FAMILY);
    expect(family?.rules).toHaveLength(1);
    expect(family?.items.find((item) => item.sku === SKU)?.rules).toEqual([]);
  });

  /**
   * **Le point que l'écran doit dire.** Dans un même étage, la règle d'article
   * REMPLACE celle de la famille — elles ne s'enchaînent pas. Sans
   * `supersededRuleIds`, l'écran alignerait deux remises dont une seule agit, et
   * le lecteur additionnerait 10 + 20 pour trouver un total qui ne colle pas.
   */
  it("signale la règle de famille SUPPLANTÉE par celle de l'article", async () => {
    const { id: familyRule } = jsonBody<{ id: string }>(
      await postRule({ scope: { type: "category", id: FAMILY }, effect: alter(1000) }),
    );
    await postRule({ scope: { type: "product", id: SKU }, effect: alter(2000) });

    const item = await croissant();

    expect(item.supersededRuleIds).toEqual([familyRule]);
    // 200 − 20 % = 160. Composées, les deux auraient donné 144.
    expect(item.finalCents).toBe(160);
    expect(item.steps).toHaveLength(1);
  });

  it("distingue la limite de l'article de celle dont il hérite", async () => {
    await staff()
      .put("/admin/pricing/floors")
      .send({ scope: { type: "category", id: FAMILY }, mode: "percent", value: 8_500 });

    const inherited = await croissant();
    expect(inherited.ownFloor).toBeNull();
    expect(inherited.effectiveFloor?.scope).toEqual({ type: "category", id: FAMILY });

    await staff()
      .put("/admin/pricing/floors")
      .send({ scope: { type: "product", id: SKU }, mode: "amount", value: 120 });

    const own = await croissant();
    expect(own.ownFloor?.value).toBe(120);
    expect(own.effectiveFloor?.scope).toEqual({ type: "product", id: SKU });
  });

  it("consigne que la limite a relevé le prix", async () => {
    await postRule({ effect: alter(5000) }); // 200 → 100
    await staff()
      .put("/admin/pricing/floors")
      .send({ scope: { type: "global", id: null }, mode: "percent", value: 7_500 });

    const item = await croissant();

    expect(item.floored).toBe(true);
    expect(item.finalCents).toBe(150);
  });

  /**
   * Le prix montré est celui d'UN article commandé par quelqu'un sans tarif
   * négocié. L'écran doit le dire : sinon cette colonne passe pour « le prix »,
   * alors qu'elle est le prix de vitrine.
   */
  it("annonce les conditions de sa simulation", async () => {
    const { simulation } = await board();

    expect(simulation).toMatchObject({ quantity: 1, audience: "all" });
    expect(Number.isNaN(Date.parse(simulation.at))).toBe(false);
  });

  it("n'applique pas une mercuriale visant un client à la vitrine", async () => {
    await postRule({
      stage: "mercuriale",
      effect: { nature: "replace", amountCents: 150 },
      audience: { type: "company", id: "cmp_dupont" },
    });

    expect((await croissant()).finalCents).toBe(CANONICAL);
  });
});

function alter(bp: number): Record<string, unknown> {
  return { nature: "alter", direction: "decrease", mode: "percent", value: bp };
}

describe("le rapport prix / volume", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  /** Une vente de `quantity` unités, datée du passé. */
  async function sell(quantity: number, daysAgo: number): Promise<void> {
    const response = await ctx
      .asSub("auth0|solo")
      .post("/orders")
      .send({
        fulfillmentMethod: "pickup",
        pickupAddressId: pickupId,
        requestedDeliveryDate: "2026-09-01",
        lines: [{ sku: SKU, quantity }],
      });
    // La commande est datée d'aujourd'hui par défaut : on la recule pour la
    // faire tomber dans la fenêtre voulue. C'est `order.createdAt` que la mesure
    // lit — la date à laquelle le prix a été résolu.
    await ctx.prisma.order.update({
      where: { id: jsonBody<{ id: string }>(response).id },
      data: { createdAt: new Date(Date.now() - daysAgo * DAY_MS) },
    });
  }

  /** Une remise posée il y a `daysAgo` jours — le point de coupure de l'avant/après. */
  function seedOldRule(bp: number, daysAgo: number) {
    return ctx.prisma.priceRule.create({
      data: {
        id: "promo",
        stage: "promotion",
        nature: "alter",
        scopeType: "global",
        audienceType: "all",
        direction: "decrease",
        mode: "percent",
        value: bp,
        validFrom: new Date(Date.now() - daysAgo * DAY_MS),
        label: "Promo",
        createdBy: "e2e",
      },
    });
  }

  it("n'attache rien aux articles dont le prix n'a pas bougé", async () => {
    expect((await croissant()).elasticity).toBeNull();
  });

  /**
   * Le chiffre qui doit sauter aux yeux : − 20 % oblige à vendre ×1,25 pour
   * encaisser le même chiffre.
   */
  it("traduit la remise en ratio de volume iso-chiffre", async () => {
    await seedOldRule(2000, 40);

    const item = await croissant();

    expect(item.finalCents).toBe(160);
    expect(item.elasticity?.isoRevenueRatioBp).toBe(12_500);
  });

  it("mesure le réalisé de part et d'autre de la pose de la règle", async () => {
    await seedOldRule(2000, 40);
    await sell(100, 60); // avant la règle
    await sell(110, 20); // après

    const since = (await croissant()).elasticity?.sinceChange;

    expect(since?.baselineVolume).toBe(100);
    expect(since?.observedVolume).toBe(110);
    // 100 × 1,25 = 125 à atteindre ; on est à 110, soit 88 %.
    expect(since?.targetVolume).toBe(125);
    expect(since?.attainmentBp).toBe(8_800);
    expect(since?.conclusive).toBe(true);
  });

  /**
   * Quelques jours après la pose, un écart ne veut rien dire. L'écran doit
   * pouvoir dire « trop tôt » plutôt que de faire juger une décision sur du bruit.
   */
  it("avoue quand le recul est insuffisant pour conclure", async () => {
    await seedOldRule(2000, 3);
    await sell(50, 1);

    expect((await croissant()).elasticity?.sinceChange?.conclusive).toBe(false);
  });

  it("rend la fenêtre glissante même sans recul sur la règle", async () => {
    await seedOldRule(2000, 1);
    await sell(80, 40); // le mois d'avant
    await sell(90, 10); // le mois écoulé

    const rolling = (await croissant()).elasticity?.rolling;

    expect(rolling?.baselineVolume).toBe(80);
    expect(rolling?.observedVolume).toBe(90);
  });

  /**
   * Sans historique, il n'y a pas d'objectif — et surtout pas un objectif de
   * zéro, qui ferait passer une absence de mesure pour une réussite.
   */
  it("n'invente pas d'objectif quand rien ne s'est vendu avant", async () => {
    await seedOldRule(2000, 40);
    await sell(30, 10);

    const since = (await croissant()).elasticity?.sinceChange;

    expect(since?.baselineVolume).toBe(0);
    expect(since?.targetVolume).toBeNull();
    expect(since?.attainmentBp).toBeNull();
  });

  /** Une commande annulée n'a rien vendu : la compter gonflerait le réalisé. */
  it("ne compte pas les commandes annulées", async () => {
    await seedOldRule(2000, 40);
    await sell(100, 60);
    await sell(110, 20);
    await ctx.prisma.order.updateMany({
      where: { createdAt: { gte: new Date(Date.now() - 30 * DAY_MS) } },
      data: { status: "cancelled" },
    });

    expect((await croissant()).elasticity?.sinceChange?.observedVolume).toBe(0);
  });
});

describe("la remise commerciale accordable", () => {
  const putFloor = (mode: string, value: number) =>
    staff()
      .put("/admin/pricing/floors")
      .send({ scope: { type: "product", id: SKU }, mode, value });

  /**
   * Sans limite posée, il n'y a pas de marge DÉFINIE. Afficher un nombre
   * supposerait un plancher que personne n'a décidé.
   */
  it("n'annonce aucune marge quand aucune limite n'est posée", async () => {
    expect((await croissant()).negotiationRoom).toBeNull();
  });

  /**
   * Les deux métriques sont portées ensemble : le commercial choisit laquelle il
   * annonce au téléphone, et aucune n'est un dérivé d'affichage de l'autre.
   */
  it("donne la marge en centimes ET en pourcentage du prix final", async () => {
    await putFloor("amount", 150);

    const room = (await croissant()).negotiationRoom;

    // 2,00 € final, plancher 1,50 € ⇒ 0,50 € accordables, soit 25 %.
    expect(room).toEqual({ floorCents: 150, maxDiscountCents: 50, maxDiscountBp: 2_500 });
  });

  it("se calcule sur le prix APRÈS altération, pas sur le canonique", async () => {
    await postRule({ effect: alter(1000) }); // 200 → 180
    await putFloor("amount", 150);

    const room = (await croissant()).negotiationRoom;

    expect(room?.maxDiscountCents).toBe(30);
    // 30 / 180 = 16,67 % — sur le prix que le client verra, pas sur 200.
    expect(room?.maxDiscountBp).toBe(1_667);
  });

  /**
   * Une limite en fraction se ramène en centimes par la MÊME arithmétique que
   * `resolvePrice`. Un arrondi divergent promettrait un centime que la caisse
   * refuserait — au pire endroit possible, devant le client.
   */
  it("ramène une limite en fraction du tarif en centimes", async () => {
    await putFloor("percent", 7_500); // 75 % de 200 = 150

    expect((await croissant()).negotiationRoom?.floorCents).toBe(150);
  });

  /** Un article déjà relevé au plancher rend zéro : c'est une information. */
  it("rend zéro quand le plancher a déjà mordu", async () => {
    await postRule({ effect: alter(5000) }); // 200 → 100
    await putFloor("amount", 150); // relevé à 150

    const item = await croissant();

    expect(item.floored).toBe(true);
    expect(item.negotiationRoom?.maxDiscountCents).toBe(0);
  });
});

describe("le signal de dérive de la limite", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  const putFloor = (mode: string, value: number) =>
    staff()
      .put("/admin/pricing/floors")
      .send({ scope: { type: "product", id: SKU }, mode, value });

  /** Vieillit la limite ET fausse sa référence, pour simuler une hausse du tarif. */
  function ageFloor(referenceCanonicalCents: number, daysAgo: number) {
    return ctx.prisma.priceFloor.update({
      where: { id: `product:${SKU}` },
      data: {
        referenceCanonicalCents,
        updatedAt: new Date(Date.now() - daysAgo * DAY_MS),
      },
    });
  }

  const floorOf = async () => (await croissant()).ownFloor;

  it("fige le tarif de référence en posant la limite", async () => {
    await putFloor("amount", 150);

    // VIE-001 vaut 200 c : la limite ne vise que lui, donc c'est sa référence.
    expect((await floorOf())?.drift?.referenceCanonicalCents).toBe(CANONICAL);
  });

  it("ne signale rien quand le tarif n'a pas bougé", async () => {
    await putFloor("amount", 150);

    const drift = (await floorOf())?.drift;
    expect(drift?.driftBp).toBe(0);
    expect(drift?.stale).toBe(false);
  });

  it("signale l'écart quand le tarif a monté depuis la décision", async () => {
    await putFloor("amount", 150);
    await ageFloor(178, 240); // 178 → 200 = +12,4 %

    const drift = (await floorOf())?.drift;
    expect(drift?.driftBp).toBe(1_236);
    expect(drift?.ageDays).toBe(240);
    expect(drift?.stale).toBe(true);
  });

  /**
   * Le point qui rend ce signal petit : une limite en FRACTION suit le tarif par
   * construction — elle ne peut pas se retrouver décalée.
   */
  it("se tait sur une limite en fraction, même très ancienne", async () => {
    await putFloor("percent", 7_500);
    await ageFloor(100, 900);

    expect((await floorOf())?.drift).toBeNull();
  });

  /**
   * L'âge seul n'alarme pas : une vieille limite sur un tarif stable est aussi
   * juste qu'au premier jour.
   */
  it("ne s'alarme pas d'une vieille limite dont le tarif n'a pas bougé", async () => {
    await putFloor("amount", 150);
    await ageFloor(CANONICAL, 900);

    const drift = (await floorOf())?.drift;
    expect(drift?.ageDays).toBe(900);
    expect(drift?.stale).toBe(false);
  });

  /**
   * CONFIRMER éteint le signal sans rien changer à la limite. Sans ce geste, la
   * seule façon de faire taire le rappel serait de MODIFIER la décision — soit
   * l'inverse du but.
   */
  it("confirmer rafraîchit la référence et la date, sans toucher à la valeur", async () => {
    await putFloor("amount", 150);
    await ageFloor(178, 240);

    const response = await staff().post(`/admin/pricing/floors/product/${SKU}/confirm`);

    expect(response.status).toBe(204);
    const floor = await floorOf();
    expect(floor?.value).toBe(150);
    expect(floor?.drift?.stale).toBe(false);
    expect(floor?.drift?.ageDays).toBe(0);
  });

  it("refuse de confirmer une limite qui n'existe pas", async () => {
    expect((await staff().post(`/admin/pricing/floors/product/${SKU}/confirm`)).status).toBe(404);
  });
});
