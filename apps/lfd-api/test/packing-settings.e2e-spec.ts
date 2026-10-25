/**
 * **Réglages › Colisage** — `GET|PUT admin/packing/settings` (Hugo,
 * 2026-10-25 : « partager une moitié devrait être un réglage dans
 * réglages/colisage, on devrait commencer avec ça désactivé »). Sur le vrai
 * Postgres : la ligne absente vaut « fermé », le `upsert` sur la clé
 * naturelle, et les droits relus en base — `delivery_settings` règle, le poste
 * (`production_packing:read`) lit sans régler.
 *
 * Le refus du geste lui-même, et le bac déjà partagé qui reste lisible, sont
 * éprouvés dans `packing-proposal.e2e-spec.ts`, qui sème une journée colisée.
 */
import type { PackingSettingsView, StaffRole } from "@lfd/contracts";

import { ADMIN_VERIFIER_OVERRIDE, admin } from "./delivery-rounds-scene.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { PACKING_SETTINGS } from "./packing-settings-scene.js";

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

async function read(): Promise<PackingSettingsView> {
  return jsonBody<PackingSettingsView>(await admin(ctx).get(PACKING_SETTINGS).expect(200));
}

describe("GET|PUT admin/packing/settings", () => {
  it("rend le partage d'une moitié FERMÉ tant que personne n'a rien posé", async () => {
    expect(await read()).toEqual({ halfSharing: false, source: "default" });
  });

  it("ouvre puis referme le partage, une seule ligne en base", async () => {
    await admin(ctx).put(PACKING_SETTINGS).send({ halfSharing: true }).expect(204);
    expect(await read()).toEqual({ halfSharing: true, source: "explicit" });

    await admin(ctx).put(PACKING_SETTINGS).send({ halfSharing: false }).expect(204);
    expect(await read()).toEqual({ halfSharing: false, source: "explicit" });
    expect(await ctx.prisma.packingSettings.count()).toBe(1);
  });

  it("refuse une forme invalide (400)", async () => {
    await admin(ctx).put(PACKING_SETTINGS).send({ halfSharing: "oui" }).expect(400);
  });
});

describe("les droits de Réglages › Colisage", () => {
  it("le poste lit le réglage sans pouvoir le poser (commercial : colisage, pas livraison)", async () => {
    const commercial = await asRole("commercial");

    await commercial.get(PACKING_SETTINGS).expect(200);
    await commercial.put(PACKING_SETTINGS).send({ halfSharing: true }).expect(403);
  });

  it("un rôle sans colisage ni réglages de livraison n'y entre pas (403)", async () => {
    const outsider = await asRole("communication");

    await outsider.get(PACKING_SETTINGS).expect(403);
  });
});
