/**
 * E2E du **socle de la composition** (plan de composition automatique, CA1 /
 * CA-D3) : sans un véhicule en service qui a ses cotes et sans un type de bac
 * en service, « Proposer » refuse en disant où régler ; et aucun geste —
 * retrait, cotes effacées, archivage — ne défait ce socle quand il existe.
 */
import type { Response } from "supertest";

import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { binTypeId, LOADING } from "./delivery-loading-scene.js";
import {
  addVehicle,
  ADMIN_VERIFIER_OVERRIDE,
  admin,
  forgetCustomer,
  VEHICLES,
} from "./delivery-rounds-scene.js";
import {
  forgetRoutingScene,
  MEASURED,
  PROPOSAL,
  ROAD_ROUTING_OVERRIDES,
  seedDeparture,
} from "./delivery-routing-scene.js";

const DAY = serviceDay();

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE, ...ROAD_ROUTING_OVERRIDES] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  forgetCustomer();
  forgetRoutingScene();
  await seedDeparture(ctx);
});

function refusal(response: Response): { readonly code: string; readonly message: string } {
  return jsonBody<{ code: string; message: string }>(response);
}

describe("« Proposer » sans socle", () => {
  it("🔴 une flotte sans cotes : 409, la phrase qui renvoie aux véhicules", async () => {
    await binTypeId(ctx);
    await addVehicle(ctx, "Kangoo");

    const refused = await admin(ctx).get(`${PROPOSAL}?jour=${DAY}`).expect(409);

    expect(refusal(refused)).toMatchObject({
      code: "delivery.no_measured_vehicle",
      message:
        "Aucun véhicule en service n'a ses cotes : renseignez la longueur, la largeur et la hauteur utiles d'un véhicule dans Livraison → Véhicules avant de proposer des tournées.",
    });
  });

  it("🔴 sans type de bac en service : 409, la phrase qui renvoie aux bacs", async () => {
    await addVehicle(ctx, "Master", MEASURED);

    const refused = await admin(ctx).get(`${PROPOSAL}?jour=${DAY}`).expect(409);

    expect(refusal(refused)).toMatchObject({ code: "delivery.no_active_bin_type" });
    expect(refusal(refused).message).toContain("Livraison → Bacs");
  });

  it("avec un véhicule mesuré et un type de bac, « Proposer » répond", async () => {
    await binTypeId(ctx);
    await addVehicle(ctx, "Master", MEASURED);

    await admin(ctx).get(`${PROPOSAL}?jour=${DAY}`).expect(200);
  });
});

describe("aucun geste ne défait le socle", () => {
  it("🔴 refuse de retirer le dernier véhicule mesuré, puis le laisse quand un autre l'est", async () => {
    const master = await addVehicle(ctx, "Master", MEASURED);
    await addVehicle(ctx, "Kangoo");

    const refused = await admin(ctx).post(`${VEHICLES}/${master}/retrait`).expect(409);
    expect(refusal(refused).code).toBe("delivery.last_measured_vehicle");
    expect(refusal(refused).message).toContain("« Master » est le dernier en service");
    expect(await ctx.prisma.deliveryVehicle.count({ where: { retiredAt: null } })).toBe(2);

    await addVehicle(ctx, "Trafic", MEASURED);
    await admin(ctx).post(`${VEHICLES}/${master}/retrait`).expect(204);
  });

  it("🔴 refuse d'effacer les cotes du dernier véhicule mesuré", async () => {
    const master = await addVehicle(ctx, "Master", MEASURED);
    const { plate } = await ctx.prisma.deliveryVehicle.findUniqueOrThrow({
      where: { id: master },
      select: { plate: true },
    });

    const refused = await admin(ctx)
      .put(`${VEHICLES}/${master}`)
      .send({ name: "Master", plate })
      .expect(409);

    expect(refusal(refused).code).toBe("delivery.last_measured_vehicle");
    const row = await ctx.prisma.deliveryVehicle.findUniqueOrThrow({ where: { id: master } });
    expect(row.cargoLengthCm).toBe(MEASURED.lengthCm);
  });

  it("🔴 refuse d'archiver le dernier type de bac en service", async () => {
    const only = await binTypeId(ctx);

    const refused = await admin(ctx).post(`${LOADING}/bacs/${only}/archiver`).expect(409);

    expect(refusal(refused).code).toBe("delivery.last_active_bin_type");
    expect(refusal(refused).message).toContain("Livraison → Bacs");
    expect(await ctx.prisma.deliveryBinType.count({ where: { archivedAt: null } })).toBe(1);

    await binTypeId(ctx, "Bac L e2e");
    await admin(ctx).post(`${LOADING}/bacs/${only}/archiver`).expect(204);
  });

  it("une flotte déjà sans cotes n'est pas figée : un véhicule sans cotes se retire", async () => {
    const kangoo = await addVehicle(ctx, "Kangoo");

    await admin(ctx).post(`${VEHICLES}/${kangoo}/retrait`).expect(204);
  });
});
