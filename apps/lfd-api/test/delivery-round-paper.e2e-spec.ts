/**
 * E2E de la **feuille de tournée en PDF** — Livraison → Tournées, « Imprimer ».
 *
 * Ce que seul l'e2e prouve : la route, sa surface (`delivery_rounds`), les
 * en-têtes servis, et les lectures réelles — arrêts vivants de la livraison,
 * feuilles du commerce par son canal — assemblées dans l'ordre de composition.
 */
import { Buffer } from "node:buffer";

import type { StaffRole } from "@lfd/contracts";

import { pdfPages } from "../src/platform/pdf/__tests__/pdf-text.js";
import {
  addVehicle,
  ADMIN_VERIFIER_OVERRIDE,
  admin,
  assign,
  forgetCustomer,
  openRound,
  ROUNDS,
  seedDelivery,
} from "./delivery-rounds-scene.js";
import { bootstrapE2e, serviceDay, type E2eContext } from "./e2e-harness.js";

const DAY = serviceDay();

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

/** Un membre du staff d'un rôle donné — une vraie fiche, le jeton EST son `sub`. */
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

describe("GET /admin/livraison/tournees/:roundId/tournee.pdf", () => {
  it("sert le PDF de la tournée, arrêts dans l'ordre, « Arrêt i/N »", async () => {
    const round = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo blanc"));
    const first = await seedDelivery(ctx, DAY);
    const second = await seedDelivery(ctx, DAY);
    await assign(ctx, DAY, round, second.id);
    await assign(ctx, DAY, round, first.id);

    const response = await admin(ctx)
      .get(`${ROUNDS}/${round}/tournee.pdf`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          callback(null, Buffer.concat(chunks));
        });
      })
      .expect(200);

    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain("attachment");
    const body: unknown = response.body;
    if (!(body instanceof Uint8Array)) {
      throw new TypeError("le corps servi n'est pas binaire");
    }
    const text = pdfPages(Buffer.from(body)).join("\n");
    expect(text).toContain("Kangoo blanc");
    // Depuis la refonte (6d2872044), le rang est une pastille : l'ordre se lit
    // à celui des références.
    expect(text).toContain("2 arrêts");
    const positions = [`Commande ${second.reference}`, `Commande ${first.reference}`].map((part) =>
      text.indexOf(part),
    );
    expect(positions.every((at) => at >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("répond 404 pour une tournée inconnue", async () => {
    await admin(ctx).get(`${ROUNDS}/inconnue/tournee.pdf`).expect(404);
  });

  it("refuse le support, qui n'a pas `delivery_rounds` (403)", async () => {
    const round = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
    const support = await asRole("support");
    await support.get(`${ROUNDS}/${round}/tournee.pdf`).expect(403);
  });
});
