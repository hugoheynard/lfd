/**
 * E2E du **tableau croisé** de la bibliothèque d'achat
 * (`documentation/livraisons/plan-bibliotheque-d-achat.md`, B-D4, lot B2) :
 * une LECTURE sous `delivery_rounds:read`, qui relit candidats et réels par
 * identifiant. Ce que seul l'e2e prouve : la relecture par les vrais
 * adaptateurs, les refus nommés (404, 409) au lieu d'un 500, et qu'aucune
 * table n'est écrite. Mesure aussi le 10 × 10 (le plan ne l'a pas supposé).
 */
import type { CreatedIdResponse, PurchaseTablePayload, PurchaseTableView } from "@lfd/contracts";

import {
  ADMIN_VERIFIER_OVERRIDE,
  admin,
  forgetCustomer,
  VEHICLES,
} from "./delivery-rounds-scene.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";

const TABLE = "/admin/livraison/assistant-achat/tableau";
const LIBRARY_VEHICLES = "/admin/livraison/bibliotheque/vehicules";
const LIBRARY_BINS = "/admin/livraison/bibliotheque/bacs";
const REAL_BINS = "/admin/livraison/bacs";

const KANGOO = {
  name: "Kangoo L2",
  cargo: { lengthCm: 220, widthCm: 150, heightCm: 125 },
  wheelArches: { lengthCm: 80, protrusionCm: 20, fromBackCm: 30, heightCm: 25 },
  priceCentsExclVat: 2_500_000,
};

const CAISSE = {
  name: "Caisse Dupont 50",
  outer: { lengthCm: 60, widthCm: 40, heightCm: 30 },
  inner: { lengthCm: 56, widthCm: 36, heightCm: 27 },
  isotherm: false,
  maxStack: 5,
  unitPriceCentsExclVat: 1_290,
};

const BAC_M = {
  name: "Bac M",
  outer: { lengthCm: 60, widthCm: 40, heightCm: 22 },
  inner: { lengthCm: 56, widthCm: 36, heightCm: 20 },
  isotherm: false,
  maxStack: 6,
  divisible: false,
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  forgetCustomer();
});

async function create(path: string, body: object): Promise<string> {
  return jsonBody<CreatedIdResponse>(await admin(ctx).post(path).send(body).expect(201)).id;
}

function code(response: Parameters<typeof jsonBody>[0]): string {
  return jsonBody<{ readonly code: string }>(response).code;
}

/** Ce que le bloc et le journal contiennent : la preuve que rien ne s'écrit. */
async function counts(): Promise<readonly number[]> {
  return Promise.all([
    ctx.prisma.deliveryVehicle.count(),
    ctx.prisma.deliveryBinType.count(),
    ctx.prisma.deliveryPurchaseVehicleCandidate.count(),
    ctx.prisma.deliveryPurchaseBinCandidate.count(),
    ctx.prisma.activityEvent.count(),
  ]);
}

describe("POST admin/livraison/assistant-achat/tableau (B-D4)", () => {
  it("croise candidats et réels, rend les coûts connus et null sinon, sans rien écrire", async () => {
    const candidate = await create(LIBRARY_VEHICLES, KANGOO);
    const fleet = await create(VEHICLES, {
      name: "Trafic",
      plate: "AB-123-CD",
      cargo: KANGOO.cargo,
    });
    const caisse = await create(LIBRARY_BINS, CAISSE);
    const bacM = await create(REAL_BINS, BAC_M);
    const before = await counts();

    const selection: PurchaseTablePayload = {
      vehicles: [
        { source: "candidate", id: candidate },
        { source: "fleet", id: fleet },
      ],
      formats: [
        { source: "candidate", id: caisse },
        { source: "bin_type", id: bacM },
      ],
      gapCm: 1,
    };
    const view = jsonBody<PurchaseTableView>(
      await admin(ctx).post(TABLE).send(selection).expect(200),
    );

    expect(view.formats.map((f) => [f.name, f.unitPriceCentsExclVat])).toEqual([
      ["Caisse Dupont 50", 1_290],
      ["Bac M", null],
    ]);
    const [priced, real] = view.rows;
    expect(priced).toMatchObject({ name: "Kangoo L2", priceCentsExclVat: 2_500_000 });
    const cell = priced!.cells[0]!;
    expect(cell.total).toBeGreaterThan(0);
    expect(cell.equipmentCostCents).toBe(cell.total * 1_290);
    expect(cell.totalCostCents).toBe(2_500_000 + cell.total * 1_290);
    expect(cell.costPerLiterCents).toBe(
      Math.floor((2 * cell.totalCostCents! + cell.usefulLiters) / (2 * cell.usefulLiters)),
    );
    expect(priced!.cells[1]).toMatchObject({ equipmentCostCents: null, costPerLiterCents: null });
    expect(priced!.best.costPerLiter).toBe(0);
    expect(real).toMatchObject({ source: "fleet", name: "Trafic", priceCentsExclVat: null });
    expect(real!.cells[0]).toMatchObject({
      equipmentCostCents: real!.cells[0]!.total * 1_290,
      totalCostCents: null,
      costPerLiterCents: null,
    });
    expect(view.bestRowByCostPerLiter).toBe(0);
    expect(await counts()).toEqual(before);
  });

  it("calcule 10 véhicules × 10 formats d'une traite, et mesure la durée", async () => {
    const vehicles = [];
    const formats = [];
    for (let i = 0; i < 10; i += 1) {
      const lengthCm = 300 + 20 * i;
      vehicles.push({
        source: "candidate" as const,
        id: await create(LIBRARY_VEHICLES, {
          ...KANGOO,
          name: `Fourgon ${i}`,
          cargo: { lengthCm, widthCm: 170, heightCm: 180 },
        }),
      });
      formats.push({
        source: "candidate" as const,
        id: await create(LIBRARY_BINS, {
          ...CAISSE,
          name: `Caisse ${i}`,
          outer: { lengthCm: 30 + 3 * i, widthCm: 20 + 2 * i, heightCm: 20 },
          inner: { lengthCm: 28 + 3 * i, widthCm: 18 + 2 * i, heightCm: 18 },
        }),
      });
    }

    const started = performance.now();
    const response = await admin(ctx).post(TABLE).send({ vehicles, formats, gapCm: 1 }).expect(200);
    const elapsedMs = performance.now() - started;

    const view = jsonBody<PurchaseTableView>(response);
    expect(view.rows).toHaveLength(10);
    expect(view.rows.every((row) => row.cells.length === 10)).toBe(true);
    // Mesure relevée pour le plan (§ 4) ; la borne ne sert qu'à voir une dérive grossière.
    process.stdout.write(`tableau 10 × 10 : ${elapsedMs.toFixed(0)} ms\n`);
    expect(elapsedMs).toBeLessThan(5_000);
  });

  it("un identifiant inconnu : 404 qui nomme sa sorte", async () => {
    const caisse = await create(LIBRARY_BINS, CAISSE);

    const response = await admin(ctx)
      .post(TABLE)
      .send({
        vehicles: [{ source: "fleet", id: "nope" }],
        formats: [{ source: "candidate", id: caisse }],
        gapCm: 1,
      })
      .expect(404);

    expect(code(response)).toBe("delivery.purchase_table_fleet_vehicle_not_found");
  });

  it("un format archivé : 409 qui le nomme ; un véhicule sans plancher : 409", async () => {
    const candidate = await create(LIBRARY_VEHICLES, KANGOO);
    const caisse = await create(LIBRARY_BINS, CAISSE);
    await admin(ctx).post(`${LIBRARY_BINS}/${caisse}/archiver`).expect(204);
    const bare = await create(VEHICLES, { name: "Nu", plate: "EF-456-GH" });
    const bacM = await create(REAL_BINS, BAC_M);

    const archived = await admin(ctx)
      .post(TABLE)
      .send({
        vehicles: [{ source: "candidate", id: candidate }],
        formats: [{ source: "candidate", id: caisse }],
        gapCm: 1,
      })
      .expect(409);
    expect(code(archived)).toBe("delivery.purchase_table_bin_candidate_archived");
    expect(JSON.stringify(archived.body)).toContain(
      "Le format « Caisse Dupont 50 » a été archivé — retirez-le de la sélection.",
    );

    const bareResponse = await admin(ctx)
      .post(TABLE)
      .send({
        vehicles: [{ source: "fleet", id: bare }],
        formats: [{ source: "bin_type", id: bacM }],
        gapCm: 1,
      })
      .expect(409);
    expect(code(bareResponse)).toBe("delivery.purchase_table_fleet_vehicle_without_cargo");
  });

  it("refuse onze véhicules ou onze formats (400), avant toute lecture", async () => {
    const ref = { source: "candidate", id: "x" };
    const eleven = Array.from({ length: 11 }, () => ref);

    await admin(ctx)
      .post(TABLE)
      .send({ vehicles: eleven, formats: [ref], gapCm: 1 })
      .expect(400);
    await admin(ctx)
      .post(TABLE)
      .send({ vehicles: [ref], formats: eleven, gapCm: 1 })
      .expect(400);
  });

  it("refuse le support (403) : le droit est celui du simulateur", async () => {
    await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: "Support",
        email: "support@lfc.test",
        role: "support",
        status: "active",
        auth0Id: "staff-support",
      },
    });
    const ref = { source: "candidate", id: "x" };

    await ctx
      .asSub("staff-support")
      .post(TABLE)
      .send({ vehicles: [ref], formats: [ref], gapCm: 1 })
      .expect(403);
  });
});
