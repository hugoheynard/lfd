/**
 * E2E de **l'assistant d'achat** (`documentation/livraisons/plan-geometrie-du-plancher.md`,
 * G-D3) : une LECTURE sous `delivery_rounds:read`, sur un plancher et des
 * formats saisis. Ni table, ni journal.
 */
import type { PurchaseAssistantPayload, PurchaseAssistantView, StaffRole } from "@lfd/contracts";

import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { ADMIN_VERIFIER_OVERRIDE, admin, forgetCustomer } from "./delivery-rounds-scene.js";

const ASSISTANT = "/admin/livraison/assistant-achat";

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

const SCENARIO: PurchaseAssistantPayload = {
  floor: {
    lengthCm: 290,
    widthCm: 166,
    heightCm: 139,
    wheelArches: { lengthCm: 90, protrusionCm: 20, fromBackCm: 60 },
  },
  gapCm: 1,
  formats: [
    {
      name: "Bac 600",
      outer: { lengthCm: 60, widthCm: 40, heightCm: 32 },
      inner: { lengthCm: 56, widthCm: 36, heightCm: 30 },
      maxStack: 5,
    },
  ],
};

/** Ce que les tables du bloc `delivery` et le journal contiennent : la preuve que rien ne s'écrit. */
async function counts(): Promise<readonly number[]> {
  return Promise.all([
    ctx.prisma.deliveryVehicle.count(),
    ctx.prisma.deliveryBinType.count(),
    ctx.prisma.deliveryRoutingSettings.count(),
    ctx.prisma.activityEvent.count(),
  ]);
}

describe("POST admin/livraison/assistant-achat (G-D3)", () => {
  it("rend le rangement par rangées de chaque format, et n'écrit rien", async () => {
    const before = await counts();

    const response = await admin(ctx).post(ASSISTANT).send(SCENARIO).expect(200);

    const view = jsonBody<PurchaseAssistantView>(response);
    expect(view.vehicleVolumeLiters).toBe(6691);
    // Le calcul fait à la main dans maximize-format.spec.ts : 16 au sol × 4 étages.
    expect(view.formats[0]).toMatchObject({
      name: "Bac 600",
      floorCount: 16,
      levels: 4,
      total: 64,
      heightLimit: "ceiling",
    });
    expect(await counts()).toEqual(before);
  });

  it("empile par-dessus des passages hauts de 30 cm : 70 bacs, 16 au sol (G-D2 bis)", async () => {
    const floor = {
      ...SCENARIO.floor,
      wheelArches: { lengthCm: 90, protrusionCm: 20, fromBackCm: 60, heightCm: 30 },
    };

    const response = await admin(ctx)
      .post(ASSISTANT)
      .send({ ...SCENARIO, floor })
      .expect(200);

    // Calcul fait à la main dans maximize-format.spec.ts : 8 + 15 + 15 + 16 + 16.
    const [format] = jsonBody<PurchaseAssistantView>(response).formats;
    expect(format).toMatchObject({ floorCount: 16, levels: 4, total: 70 });
    const lateral = format!.rows.filter((row) => row.overArchCount > 0);
    expect(lateral.map((row) => row.overArchFromLevel)).toEqual([1, 1]);
  });

  it("refuse onze formats (400), avant tout calcul", async () => {
    const formats = Array.from({ length: 11 }, () => SCENARIO.formats[0]!);

    await admin(ctx)
      .post(ASSISTANT)
      .send({ ...SCENARIO, formats })
      .expect(400);
  });

  it("refuse une dimension hors des bornes de CargoSpace (400), par le domaine", async () => {
    const floor = { ...SCENARIO.floor, lengthCm: 1001 };

    const response = await admin(ctx)
      .post(ASSISTANT)
      .send({ ...SCENARIO, floor })
      .expect(400);

    expect(JSON.stringify(response.body)).toContain("longueur vaut 1001 cm");
  });

  it("refuse le support (403) : le droit est celui du simulateur", async () => {
    const support = await asRole("support");

    await support.post(ASSISTANT).send(SCENARIO).expect(403);
  });
});

/** Sème une personne de ce rôle, déjà entrée, et rend son agent HTTP. */
async function asRole(role: StaffRole): Promise<ReturnType<E2eContext["asSub"]>> {
  const sub = `staff-${role}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: role,
      email: `${role}@lfc.test`,
      role,
      status: "active",
      auth0Id: sub,
    },
  });
  return ctx.asSub(sub);
}
