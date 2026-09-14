import { randomUUID } from "node:crypto";
/**
 * E2E de la **fiche d'atelier** — ce que le fournil a à sortir, et ce qui l'est.
 *
 * Trois choses ne se prouvent qu'ici, contre du vrai SQL :
 *
 * - **l'arbitrage des deux sources** — une journée ouverte rend la demande du
 *   commerce sans heure de tirage, une journée arrêtée rend son instantané ;
 * - **l'écart**, qui suppose une commande réellement passée APRÈS la clôture,
 *   donc deux écritures que rien ne relie hors de la base ;
 * - **le retirage qui garde les coches**, où la journée est effacée puis
 *   recréée par `save` : une coche perdue là ferait refaire au fournil ce qui
 *   est déjà sorti du four, et aucun test unitaire ne voit cette réécriture.
 */
import {
  addDays,
  localToInstant,
  type ProductionContainerView,
  type ProductionWorksheetRetake,
  type ProductionWorksheetView,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";

const MEMBER = "auth0|member";
const STAFF = "staff-e2e";
const SERVICE_DAY = serviceDay();

/** Le croissant du catalogue de test — `VIE-001`, « Croissant ». */
const CROISSANT = "VIE-001";
/** La baguette — le second article, celui que l'écart fait apparaître. */
const BAGUETTE = "PAI-001";

const SITE = {
  label: "Boutique",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

/** Signature du jeton staff doublée : le reste du mur admin est réel. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: STAFF, scopes: [] }),
};

let intentCount = 0;
const fakeGateway = {
  createIntent: () => {
    intentCount += 1;
    const id = `pi_e2e_${String(intentCount)}`;
    return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` });
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
};

/**
 * L'horloge du serveur, figée à MAINTENANT avant chaque test — jamais à une
 * date du calendrier. Seule la route « en cours » la déplace, et toujours
 * relativement à la journée servie.
 */
const clock = new FixedClock(new Date());

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: fakeGateway },
      { token: Clock, value: clock },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  clock.set(new Date());
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
});

/** Passe une commande de retrait pour la journée servie. */
async function place(sku: string, quantity: number): Promise<void> {
  const point = await ctx.prisma.pickupAddress.findFirst({ select: { id: true } });
  const id =
    point?.id ?? (await ctx.prisma.pickupAddress.create({ data: { ...SITE, isDefault: true } })).id;
  await ctx
    .asSub(MEMBER)
    .post(`/orders`)
    .send({
      idempotencyKey: randomUUID(),
      companyId: null,
      requestedDeliveryDate: SERVICE_DAY,
      fulfillmentMethod: "pickup",
      pickupAddressId: id,
      note: "",
      lines: [{ sku, quantity }],
    })
    .expect(201);
}

/** Arrête le plan du jour et rend l'heure du tirage. */
async function closePlan(): Promise<string> {
  const response = await ctx
    .asSub(STAFF)
    .post(`/admin/production/batch/${SERVICE_DAY}/close`)
    .expect(201);
  return jsonBody<{ closedAt: string }>(response).closedAt;
}

async function worksheet(): Promise<ProductionWorksheetView> {
  return jsonBody<ProductionWorksheetView>(
    await ctx.asSub(STAFF).get(`/admin/production/worksheet?date=${SERVICE_DAY}`).expect(200),
  );
}

async function mark(sku: string, initials: string, expected = 204): Promise<void> {
  await ctx
    .asSub(STAFF)
    .put(`/admin/production/worksheet/${SERVICE_DAY}/lines/${sku}/done`)
    .send({ initials })
    .expect(expected);
}

/** La ligne d'un SKU, ou l'échec — une fiche qui ne la porte pas est le bug. */
function lineOf(
  view: ProductionWorksheetView,
  sku: string,
): ProductionWorksheetView["lines"][number] {
  const line = view.lines.find((candidate) => candidate.sku === sku);
  if (line === undefined) {
    throw new Error(`La fiche du ${view.date} ne porte aucune ligne « ${sku} ».`);
  }
  return line;
}

describe("la fiche d'une journée OUVERTE", () => {
  it("rend la demande du commerce, sans heure de tirage ni écart", async () => {
    await place(CROISSANT, 12);

    const view = await worksheet();

    expect(view.date).toBe(SERVICE_DAY);
    expect(view.generatedAt).toBeNull();
    expect(view.retakenAt).toBeNull();
    expect(view.drift).toBeNull();
    expect(view.lines).toHaveLength(1);
    expect(lineOf(view, CROISSANT)).toMatchObject({
      productName: "Croissant",
      quantity: 12,
      done: false,
      initials: null,
      doneAt: null,
    });
  });

  it("refuse de cocher : rien n'est arrêté, donc il n'y a rien à cocher", async () => {
    await place(CROISSANT, 12);

    await mark(CROISSANT, "MB", 409);
  });
});

describe("la fiche d'une journée ARRÊTÉE", () => {
  it("rend l'instantané et l'heure du tirage", async () => {
    await place(CROISSANT, 12);
    const closedAt = await closePlan();

    const view = await worksheet();

    expect(view.generatedAt).toBe(closedAt);
    expect(view.drift).toBeNull();
    expect(view.lines).toHaveLength(1);
    expect(lineOf(view, CROISSANT).quantity).toBe(12);
  });

  it("montre la coche, ses initiales et son heure après un geste du fournil", async () => {
    await place(CROISSANT, 12);
    await closePlan();

    await mark(CROISSANT, "MB");
    const view = await worksheet();

    const line = lineOf(view, CROISSANT);
    expect(line.done).toBe(true);
    expect(line.initials).toBe("MB");
    expect(line.doneAt).not.toBeNull();
  });

  it("enlève la coche quand on décoche — un doigt fariné n'est pas un incident", async () => {
    await place(CROISSANT, 12);
    await closePlan();
    await mark(CROISSANT, "MB");

    await ctx
      .asSub(STAFF)
      .delete(`/admin/production/worksheet/${SERVICE_DAY}/lines/${CROISSANT}/done`)
      .expect(204);

    expect(lineOf(await worksheet(), CROISSANT)).toMatchObject({
      done: false,
      initials: null,
      doneAt: null,
    });
  });

  it("refuse un SKU qui n'est pas au compte du jour", async () => {
    await place(CROISSANT, 12);
    await closePlan();

    await mark("PAI-999", "MB", 404);
  });
});

describe("l'écart et le retirage", () => {
  it("fait apparaître l'écart d'une commande passée APRÈS la clôture", async () => {
    await place(CROISSANT, 12);
    await closePlan();
    await place(BAGUETTE, 30);

    const view = await worksheet();

    // La fiche, elle, n'a pas bougé : l'instantané ne se recalcule pas.
    expect(view.lines).toHaveLength(1);
    expect(view.drift).not.toBeNull();
    expect(view.drift?.orders).toBe(1);
    expect(view.drift?.addedUnits).toBe(30);
    expect(view.drift?.lines).toHaveLength(1);
    expect(view.drift?.lines[0]).toMatchObject({
      sku: BAGUETTE,
      productName: "Baguette tradition",
      from: 0,
      to: 30,
      done: false,
    });
  });

  it("🔴 absorbe l'écart et GARDE la coche déjà posée", async () => {
    // La journée est effacée puis recréée par `save` : c'est là que les coches
    // se perdraient, et le fournil referait ce qui est déjà sorti du four.
    await place(CROISSANT, 12);
    await closePlan();
    await mark(CROISSANT, "MB");
    await place(CROISSANT, 6);

    const retake = jsonBody<ProductionWorksheetRetake>(
      await ctx.asSub(STAFF).post(`/admin/production/worksheet/${SERVICE_DAY}/retake`).expect(201),
    );

    expect(retake.absorbed).toBe(1);
    const view = await worksheet();
    expect(view.retakenAt).toBe(retake.retakenAt);
    expect(view.drift).toBeNull();
    expect(view.lines).toHaveLength(1);
    expect(lineOf(view, CROISSANT)).toMatchObject({ quantity: 18, done: true, initials: "MB" });
  });

  it("rend `absorbed: 0` au second retirage — une information, pas une erreur", async () => {
    await place(CROISSANT, 12);
    await closePlan();
    await place(CROISSANT, 6);

    const first = jsonBody<ProductionWorksheetRetake>(
      await ctx.asSub(STAFF).post(`/admin/production/worksheet/${SERVICE_DAY}/retake`).expect(201),
    );
    const second = jsonBody<ProductionWorksheetRetake>(
      await ctx.asSub(STAFF).post(`/admin/production/worksheet/${SERVICE_DAY}/retake`).expect(201),
    );

    expect(first.absorbed).toBe(1);
    expect(second.absorbed).toBe(0);
    // Le tirage affiché ne bouge pas : rien n'a été repris.
    expect(second.retakenAt).toBe(first.retakenAt);
  });

  it("refuse un retirage sur une journée qui n'est pas arrêtée", async () => {
    await place(CROISSANT, 12);

    await ctx.asSub(STAFF).post(`/admin/production/worksheet/${SERVICE_DAY}/retake`).expect(409);
  });
});

describe("le contenant", () => {
  async function containers(): Promise<readonly ProductionContainerView[]> {
    return jsonBody<readonly ProductionContainerView[]>(
      await ctx.asSub(STAFF).get(`/admin/production/containers`).expect(200),
    );
  }

  it("traduit la quantité en matériel, arrondi AU-DESSUS", async () => {
    await place(CROISSANT, 41);
    await closePlan();
    await ctx
      .asSub(STAFF)
      .put(`/admin/production/containers/${CROISSANT}`)
      .send({ unitsPerContainer: 10, singular: "plaque", plural: "plaques" })
      .expect(204);

    expect(lineOf(await worksheet(), CROISSANT).containerLabel).toBe("5 plaques");
  });

  it("laisse la colonne VIDE quand aucun contenant n'est réglé", async () => {
    await place(CROISSANT, 41);
    await closePlan();

    expect(lineOf(await worksheet(), CROISSANT).containerLabel).toBeNull();
  });

  it("liste les réglages, les remplace, et les retire", async () => {
    await ctx
      .asSub(STAFF)
      .put(`/admin/production/containers/${CROISSANT}`)
      .send({ unitsPerContainer: 10, singular: "plaque", plural: "plaques" })
      .expect(204);
    await ctx
      .asSub(STAFF)
      .put(`/admin/production/containers/${CROISSANT}`)
      .send({ unitsPerContainer: 12, singular: "plaque", plural: "plaques" })
      .expect(204);

    const posed = await containers();
    expect(posed).toHaveLength(1);
    expect(posed[0]).toMatchObject({ sku: CROISSANT, unitsPerContainer: 12 });

    await ctx.asSub(STAFF).delete(`/admin/production/containers/${CROISSANT}`).expect(204);
    expect(await containers()).toEqual([]);
  });

  it("refuse un contenant qui ne porterait aucune pièce", async () => {
    await ctx
      .asSub(STAFF)
      .put(`/admin/production/containers/${CROISSANT}`)
      .send({ unitsPerContainer: 0, singular: "plaque", plural: "plaques" })
      .expect(400);
  });
});

describe("les fiches par rayon", () => {
  it("sert les groupes dans l'ordre de la vitrine, avec leurs deux listes et leurs compteurs", async () => {
    await place(BAGUETTE, 30);
    await place(CROISSANT, 12);
    await closePlan();
    await mark(BAGUETTE, "MB");

    const view = await worksheet();

    expect(view.shelvesKnown).toBe(true);
    // Sept jours devant : ni aujourd'hui, ni demain.
    expect(view.relativeDay).toBeNull();
    expect(view.groups.map((group) => group.key)).toEqual(["viennoiserie", "pain"]);
    expect(view.groups[0]).toMatchObject({
      lineCount: 1,
      pendingCount: 1,
      doneCount: 0,
      remainingUnits: 12,
    });
    expect(view.groups[0]?.pending.map((line) => line.sku)).toEqual([CROISSANT]);
    expect(view.groups[1]).toMatchObject({
      label: "Pains",
      pendingCount: 0,
      doneCount: 1,
      doneUnits: 30,
      remainingUnits: 0,
    });
    expect(view.groups[1]?.done[0]).toMatchObject({ sku: BAGUETTE, initials: "MB" });
  });
});

describe("la fiche EN COURS", () => {
  /** L'horloge posée à midi, à Paris, la VEILLE de la journée servie. */
  function eveOfServiceDay(): void {
    const noon = localToInstant(addDays(SERVICE_DAY, -1), "12:00");
    if (noon === null) {
      throw new Error("Midi existe tous les jours à Paris.");
    }
    clock.set(noon);
  }

  async function current(): Promise<ProductionWorksheetView> {
    return jsonBody<ProductionWorksheetView>(
      await ctx.asSub(STAFF).get(`/admin/production/worksheet/current`).expect(200),
    );
  }

  it("sert AUJOURD'HUI tant que le plan de demain n'est pas arrêté", async () => {
    await place(CROISSANT, 12);
    eveOfServiceDay();

    const view = await current();

    expect(view.date).toBe(addDays(SERVICE_DAY, -1));
    expect(view.relativeDay).toBe("today");
  });

  it("sert DEMAIN dès que son plan est arrêté", async () => {
    await place(CROISSANT, 12);
    const closedAt = await closePlan();
    eveOfServiceDay();

    const view = await current();

    expect(view.date).toBe(SERVICE_DAY);
    expect(view.relativeDay).toBe("tomorrow");
    expect(view.generatedAt).toBe(closedAt);
    expect(view.groups.map((group) => group.key)).toEqual(["viennoiserie"]);
  });
});
