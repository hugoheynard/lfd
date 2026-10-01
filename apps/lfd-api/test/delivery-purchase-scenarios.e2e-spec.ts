/**
 * E2E des **scénarios d'achat** (`documentation/livraisons/plan-bibliotheque-d-achat.md`,
 * B-D5, lot B3).
 *
 * Ce que seul l'e2e prouve : l'aller-retour du `jsonb` revalidé, l'index
 * partiel sur le nom, la relecture d'un scénario dont un candidat a été
 * archivé (nommé, jamais une 500), les faits relus en base, et les droits du
 * simulateur relus en base (B-D6).
 */
import type {
  CreatedIdResponse,
  PurchaseScenariosView,
  PurchaseScenarioView,
  PurchaseTableView,
  SavePurchaseScenarioPayload,
} from "@lfd/contracts";
import { checkJournalFact } from "@lfd/contracts/journal-facts";

import { ADMIN_VERIFIER_OVERRIDE, admin } from "./delivery-rounds-scene.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";

const SCENARIOS = "/admin/livraison/assistant-achat/scenarios";
const TABLE = "/admin/livraison/assistant-achat/tableau";
const LIBRARY_VEHICLES = "/admin/livraison/bibliotheque/vehicules";
const LIBRARY_BINS = "/admin/livraison/bibliotheque/bacs";

const KANGOO = {
  name: "Kangoo L2",
  cargo: { lengthCm: 220, widthCm: 150, heightCm: 125 },
  wheelArches: null,
  reference: null,
  purchaseUrl: null,
  priceCentsExclVat: null,
};

const caisse = (name: string): object => ({
  name,
  outer: { lengthCm: 60, widthCm: 40, heightCm: 30 },
  inner: { lengthCm: 56, widthCm: 36, heightCm: 27 },
  isotherm: false,
  maxStack: 5,
  supplier: null,
  reference: null,
  purchaseUrl: null,
  unitPriceCentsExclVat: null,
});

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

function code(response: Parameters<typeof jsonBody>[0]): string {
  return jsonBody<{ readonly code: string }>(response).code;
}

async function created(path: string, body: object): Promise<string> {
  return jsonBody<CreatedIdResponse>(await admin(ctx).post(path).send(body).expect(201)).id;
}

/** Un véhicule et deux formats candidats, et un scénario qui les cite tous. */
async function scene(): Promise<{
  vehicle: string;
  kept: string;
  doomed: string;
  payload: SavePurchaseScenarioPayload;
}> {
  const vehicle = await created(LIBRARY_VEHICLES, KANGOO);
  const kept = await created(LIBRARY_BINS, caisse("Caisse maison"));
  const doomed = await created(LIBRARY_BINS, caisse("Caisse Dupont 50"));
  const payload: SavePurchaseScenarioPayload = {
    name: "Kangoo et caisses",
    selection: {
      vehicles: [{ source: "candidate", id: vehicle }],
      formats: [
        { source: "candidate", id: kept },
        { source: "candidate", id: doomed },
      ],
      gapCm: 1,
    },
    display: { criterion: "volume", showCostPerLiter: true },
  };
  return { vehicle, kept, doomed, payload };
}

async function list(query = ""): Promise<PurchaseScenariosView> {
  return jsonBody<PurchaseScenariosView>(await admin(ctx).get(`${SCENARIOS}${query}`).expect(200));
}

async function read(id: string): Promise<PurchaseScenarioView> {
  return jsonBody<PurchaseScenarioView>(await admin(ctx).get(`${SCENARIOS}/${id}`).expect(200));
}

describe("enregistrer, relire, remplacer", () => {
  it("rend la sélection et l'affichage tels qu'enregistrés, sans élément à corriger", async () => {
    const { payload } = await scene();
    const id = await created(SCENARIOS, payload);

    expect((await list()).scenarios).toMatchObject([
      { id, name: payload.name, vehicles: 1, formats: 2, archivedAt: null },
    ]);
    expect(await read(id)).toMatchObject({
      id,
      name: payload.name,
      selection: payload.selection,
      display: payload.display,
      archivedAt: null,
      issues: [],
    });
  });

  it("remplace le nom et le contenu ; un affichage absent se relit `null`", async () => {
    const { payload } = await scene();
    const id = await created(SCENARIOS, payload);

    await admin(ctx)
      .put(`${SCENARIOS}/${id}`)
      .send({ ...payload, name: "Renommé", display: null })
      .expect(204);

    expect(await read(id)).toMatchObject({ name: "Renommé", display: null });
  });

  it("refuse un nom en double (409), un jeu hors bornes (400), un inconnu (404)", async () => {
    const { payload } = await scene();
    const id = await created(SCENARIOS, payload);

    expect(code(await admin(ctx).post(SCENARIOS).send(payload).expect(409))).toBe(
      "delivery.purchase_scenario_name_taken",
    );
    const wide = { ...payload, name: "Large", selection: { ...payload.selection, gapCm: 11 } };
    expect(code(await admin(ctx).post(SCENARIOS).send(wide).expect(400))).toBe(
      "delivery.bin_gap_invalid",
    );
    expect(code(await admin(ctx).get(`${SCENARIOS}/nope`).expect(404))).toBe(
      "delivery.purchase_scenario_not_found",
    );
    await admin(ctx)
      .put(`${SCENARIOS}/${id}`)
      .send({ ...payload, name: "" })
      .expect(400);
  });
});

describe("archiver, réactiver", () => {
  it("archive (le nom se libère), liste les archivés sur demande, réactive", async () => {
    const { payload } = await scene();
    const id = await created(SCENARIOS, payload);

    await admin(ctx).post(`${SCENARIOS}/${id}/archiver`).expect(204);
    expect((await list()).scenarios).toEqual([]);
    expect((await list("?archives=inclure")).scenarios).toMatchObject([{ id }]);
    expect(code(await admin(ctx).post(`${SCENARIOS}/${id}/archiver`).expect(409))).toBe(
      "delivery.purchase_scenario_already_archived",
    );

    const twin = await created(SCENARIOS, payload);
    expect(code(await admin(ctx).post(`${SCENARIOS}/${id}/reactiver`).expect(409))).toBe(
      "delivery.purchase_scenario_name_taken",
    );
    await admin(ctx).post(`${SCENARIOS}/${twin}/archiver`).expect(204);
    await admin(ctx).post(`${SCENARIOS}/${id}/reactiver`).expect(204);
    expect((await list()).scenarios).toMatchObject([{ id }]);
  });
});

describe("relire un scénario dont un élément a disparu (B-D5)", () => {
  it("s'ouvre quand même, nomme l'archivé et l'introuvable, et se relance sans eux", async () => {
    const { kept, doomed, payload } = await scene();
    const ghost = { source: "bin_type" as const, id: "type-disparu" };
    const id = await created(SCENARIOS, {
      ...payload,
      selection: { ...payload.selection, formats: [...payload.selection.formats, ghost] },
    });
    await admin(ctx).post(`${LIBRARY_BINS}/${doomed}/archiver`).expect(204);

    const view = await read(id);

    expect(view.issues).toEqual([
      {
        kind: "bin_candidate",
        source: "candidate",
        id: doomed,
        name: "Caisse Dupont 50",
        problem: "archived",
        message: "Le format « Caisse Dupont 50 » a été archivé — retirez-le de la sélection.",
      },
      expect.objectContaining({ kind: "bin_type", id: ghost.id, name: null, problem: "not_found" }),
    ]);
    // Le tableau, lui, refuse l'archivé en le nommant…
    expect(code(await admin(ctx).post(TABLE).send(view.selection).expect(409))).toBe(
      "delivery.purchase_table_bin_candidate_archived",
    );
    // … et se relance une fois les éléments signalés retirés.
    const formats = [{ source: "candidate" as const, id: kept }];
    const table = jsonBody<PurchaseTableView>(
      await admin(ctx)
        .post(TABLE)
        .send({ ...view.selection, formats })
        .expect(200),
    );
    expect(table.rows).toHaveLength(1);
  });

  it("un contenu qui ne se relit plus rend un 409 qui le nomme — et s'archive", async () => {
    const { payload } = await scene();
    const id = await created(SCENARIOS, payload);
    await ctx.prisma.deliveryPurchaseScenario.update({
      where: { id },
      data: { content: { selection: { vehicles: [] } } },
    });

    expect(code(await admin(ctx).get(`${SCENARIOS}/${id}`).expect(409))).toBe(
      "delivery.purchase_scenario_unreadable",
    );
    expect((await list()).scenarios).toMatchObject([{ id, vehicles: 0, formats: 0 }]);
    await admin(ctx).post(`${SCENARIOS}/${id}/archiver`).expect(204);
  });
});

describe("le journal", () => {
  it("trace chaque geste, et chaque charge passe le catalogue des faits", async () => {
    const { payload } = await scene();
    const id = await created(SCENARIOS, payload);
    await admin(ctx)
      .put(`${SCENARIOS}/${id}`)
      .send({ ...payload, name: "Renommé" })
      .expect(204);
    await admin(ctx).post(`${SCENARIOS}/${id}/archiver`).expect(204);
    await admin(ctx).post(`${SCENARIOS}/${id}/reactiver`).expect(204);

    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: { startsWith: "delivery_purchase_scenario." } },
      orderBy: { id: "asc" },
      select: { type: true, payload: true },
    });
    expect(facts.map((fact) => fact.type)).toEqual([
      "delivery_purchase_scenario.created",
      "delivery_purchase_scenario.replaced",
      "delivery_purchase_scenario.archived",
      "delivery_purchase_scenario.reactivated",
    ]);
    for (const fact of facts) {
      expect(checkJournalFact(fact.type, fact.payload)).toBeNull();
    }
  });
});

describe("les droits du simulateur (B-D6)", () => {
  async function staff(
    sub: string,
    readsRounds: boolean,
  ): Promise<ReturnType<E2eContext["asSub"]>> {
    const row = await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: sub,
        email: `${sub}@lfc.test`,
        role: "support",
        status: "active",
        auth0Id: sub,
      },
    });
    if (readsRounds) {
      await ctx.prisma.staffPermissionOverride.create({
        data: { staffUserId: row.id, resource: "delivery_rounds", action: "read", effect: "allow" },
      });
    }
    return ctx.asSub(sub);
  }

  it("un lecteur des tournées lit et rouvre, mais n'écrit pas (403)", async () => {
    const { payload } = await scene();
    const id = await created(SCENARIOS, payload);
    const reader = await staff("staff-rounds-reader", true);

    await reader.get(SCENARIOS).expect(200);
    await reader.get(`${SCENARIOS}/${id}`).expect(200);
    await reader
      .post(SCENARIOS)
      .send({ ...payload, name: "Autre" })
      .expect(403);
    await reader.put(`${SCENARIOS}/${id}`).send(payload).expect(403);
    await reader.post(`${SCENARIOS}/${id}/archiver`).expect(403);
  });

  it("sans droit sur les tournées, rien ne se lit (403)", async () => {
    const support = await staff("staff-support", false);

    await support.get(SCENARIOS).expect(403);
  });
});
