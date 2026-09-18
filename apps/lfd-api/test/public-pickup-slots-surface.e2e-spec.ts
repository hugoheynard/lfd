/**
 * E2E de la **surface publique** des créneaux de retrait — ce qu'un visiteur
 * sans compte peut lire (`GET /pickup-addresses/:id/creneaux?jour=…`).
 *
 * Le réglage, lui, est éprouvé par `public-pickup-slots.e2e-spec.ts` : cette
 * suite-ci ne vérifie pas qu'une grille s'enregistre, mais ce qui en SORT pour
 * le public. Deux propriétés que seule une suite HTTP peut tenir :
 *
 * - la route répond **sans porteur** — c'est tout son objet, et une garde posée
 *   par mégarde la fermerait sans qu'aucun test unitaire ne s'en aperçoive ;
 * - elle sert des **heures**, jamais les règles ni les fermetures qui les
 *   produisent : ce qui regarde un visiteur, c'est quand il peut venir, pas
 *   comment le comptoir organise ses plages.
 */
import type { CreatedPickupResponse, PublicPickupSlot } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

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
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

/** Les heures PRO du point — ce chantier n'y touche pas. */
const PRO_OPENING = {
  publicOpening: { start: "07:00", end: "20:00" },
  proPickup: { start: "05:00", end: "06:30" },
};

const point = (label: string): Record<string, unknown> => ({
  label,
  ligne1: "1 rue du Test",
  ligne2: "",
  codePostal: "75001",
  ville: "Paris",
  pays: "France",
  isDefault: false,
  opening: PRO_OPENING,
});

/** Une plage « tous les jours » : le jour demandé n'a pas à être deviné. */
const MORNING = {
  weekday: null,
  startTime: "07:00",
  endTime: "09:00",
  slotMinutes: 30,
  badge: "Première fournée",
  serviceCapacity: null,
};

async function createPoint(label: string): Promise<string> {
  const response = await staff().post("/admin/pickup-addresses").send(point(label)).expect(201);
  return jsonBody<CreatedPickupResponse>(response).id;
}

async function setGrid(id: string, rules: readonly unknown[], closures: readonly unknown[] = []) {
  await staff()
    .put(`/admin/pickup-addresses/${id}/creneaux-publics`)
    .send({ rules, closures })
    .expect(204);
}

/** L'appel du VISITEUR : aucun en-tête d'autorisation. */
async function slotsOf(id: string, day: string): Promise<readonly PublicPickupSlot[]> {
  const response = await ctx.http().get(`/pickup-addresses/${id}/creneaux`).query({ jour: day });
  expect(response.status).toBe(200);
  return jsonBody<readonly PublicPickupSlot[]>(response);
}

describe("créneaux publics — ce qu'un visiteur lit", () => {
  it("🔴 répond SANS porteur, et sert les heures de la grille", async () => {
    const id = await createPoint("Le Labo");
    await setGrid(id, [MORNING]);
    const day = serviceDay();

    const slots = await slotsOf(id, day);

    // 07:00→09:00 par 30 min : quatre créneaux, et pas un cinquième qui
    // déborderait la plage.
    expect(slots.map((slot) => slot.time)).toEqual(["07:00", "07:30", "08:00", "08:30"]);
    expect(slots[0]).toMatchObject({ day, badge: "Première fournée", open: true });
  });

  it("🔴 sert des HEURES, jamais les règles qui les produisent", async () => {
    // Un visiteur n'a pas à savoir qu'une plage fait 07:00–09:00 par 30 min, ni
    // combien de personnes le comptoir accepte : ça se règle, ça ne se publie
    // pas. La fuite serait silencieuse — un champ de trop passe tous les tests.
    const id = await createPoint("Le Labo");
    await setGrid(id, [{ ...MORNING, serviceCapacity: 4 }]);

    const slots = await slotsOf(id, serviceDay());

    for (const slot of slots) {
      expect(Object.keys(slot).sort()).toEqual(
        [
          "badge",
          "day",
          "endAt",
          "nextOpenTime",
          "open",
          "serviceCapacity",
          "startAt",
          "taken",
          "time",
        ].sort(),
      );
      expect(slot).not.toHaveProperty("slotMinutes");
      expect(slot).not.toHaveProperty("startTime");
      expect(slot).not.toHaveProperty("weekday");
    }
  });

  it("un point NON RÉGLÉ rend une liste vide — un état normal, pas une panne", async () => {
    const id = await createPoint("Le Village");

    expect(await slotsOf(id, serviceDay())).toEqual([]);
  });

  it("🔴 un point INCONNU rend 404, et non une liste vide", async () => {
    // La distinction compte : vide veut dire « rien ce jour-là », et un écran
    // l'affiche comme tel. Un identifiant faux qui rendrait vide ferait
    // annoncer une fermeture qui n'existe pas.
    const response = await ctx
      .http()
      .get("/pickup-addresses/pickup_inconnu/creneaux")
      .query({ jour: serviceDay() });

    expect(response.status).toBe(404);
  });

  it("refuse (400) un jour mal formé plutôt que de rendre vide", async () => {
    const id = await createPoint("Le Labo");
    await setGrid(id, [MORNING]);

    const response = await ctx
      .http()
      .get(`/pickup-addresses/${id}/creneaux`)
      .query({ jour: "demain" });

    expect(response.status).toBe(400);
  });

  it("une fermeture sans bornes vide la journée, malgré la grille", async () => {
    const id = await createPoint("Le Labo");
    const day = serviceDay();
    await setGrid(id, [MORNING], [{ fromDay: day, toDay: day, reason: "Congés" }]);

    expect(await slotsOf(id, day)).toEqual([]);
  });

  it("une fermeture BORNÉE ne retire que les créneaux qu'elle touche", async () => {
    const id = await createPoint("Le Labo");
    const day = serviceDay();
    await setGrid(
      id,
      [MORNING],
      [{ fromDay: day, toDay: day, startTime: "07:00", endTime: "08:00", reason: "Livraison" }],
    );

    const slots = await slotsOf(id, day);

    // La grille ne se DÉCALE pas : les deux créneaux touchés disparaissent, les
    // suivants gardent leurs heures.
    expect(slots.map((slot) => slot.time)).toEqual(["08:00", "08:30"]);
  });
});
