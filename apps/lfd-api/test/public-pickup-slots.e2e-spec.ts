/**
 * E2E des **créneaux de retrait public** d'un point — plan
 * `documentation/b2b/plan-creneaux-de-retrait.md`, lot A.
 *
 * Ce que seule cette suite peut prouver : que les deux tables neuves existent
 * vraiment, que l'horaire fait l'aller-retour par le vrai SQL sans rien perdre,
 * que le refus de chevauchement remonte en 409 — et surtout que le retrait
 * **pro** d'un point non réglé est **inchangé**, à l'octet près (D6). C'est cette
 * dernière propriété qui rend le lot sûr : tout le reste est additif.
 */
import {
  publicPickupSlotsFor,
  type CreatedPickupResponse,
  type PickupAddressView,
  type PublicPickupScheduleView,
} from "@lfd/contracts";

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

/** Les heures PRO du point, celles que ce chantier ne touche pas. */
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

async function createPoint(label: string): Promise<string> {
  const response = await staff().post("/admin/pickup-addresses").send(point(label)).expect(201);
  return jsonBody<CreatedPickupResponse>(response).id;
}

async function schedule(id: string): Promise<PublicPickupScheduleView> {
  const response = await staff().get(`/admin/pickup-addresses/${id}/creneaux-publics`).expect(200);
  return jsonBody<PublicPickupScheduleView>(response);
}

/** Une plage « tous les jours » : le jour de service n'a pas à être deviné. */
const MORNING = {
  weekday: null,
  startTime: "07:00",
  endTime: "09:00",
  slotMinutes: 30,
  badge: "Sortie du four",
  serviceCapacity: 2,
};

describe("créneaux publics de retrait — le réglage", () => {
  it("enregistre une grille et la relit, identifiants compris", async () => {
    const id = await createPoint("Labo Paris");

    await staff()
      .put(`/admin/pickup-addresses/${id}/creneaux-publics`)
      .send({ rules: [MORNING], closures: [] })
      .expect(204);

    const served = await schedule(id);
    expect(served.rules).toHaveLength(1);
    expect(served.rules[0]).toMatchObject({
      weekday: null,
      startTime: "07:00",
      endTime: "09:00",
      slotMinutes: 30,
      badge: "Sortie du four",
      serviceCapacity: 2,
    });
    expect(served.rules[0]?.id).toEqual(expect.stringContaining("ppslot_"));
  });

  it("le `PUT` remplace en bloc : la grille précédente ne survit pas", async () => {
    const id = await createPoint("Labo Paris");
    await staff()
      .put(`/admin/pickup-addresses/${id}/creneaux-publics`)
      .send({ rules: [MORNING], closures: [] })
      .expect(204);

    await staff()
      .put(`/admin/pickup-addresses/${id}/creneaux-publics`)
      .send({ rules: [{ ...MORNING, startTime: "14:00", endTime: "16:00" }], closures: [] })
      .expect(204);

    const served = await schedule(id);
    expect(served.rules).toHaveLength(1);
    expect(served.rules[0]?.startTime).toBe("14:00");
  });

  it("refuse (409) deux plages qui se chevauchent, et n'écrit rien", async () => {
    const id = await createPoint("Labo Paris");
    await staff()
      .put(`/admin/pickup-addresses/${id}/creneaux-publics`)
      .send({ rules: [MORNING], closures: [] })
      .expect(204);

    const response = await staff()
      .put(`/admin/pickup-addresses/${id}/creneaux-publics`)
      .send({
        rules: [
          { ...MORNING, startTime: "07:00", endTime: "09:00" },
          { ...MORNING, startTime: "08:00", endTime: "10:00" },
        ],
        closures: [],
      });

    expect(response.status).toBe(409);
    expect((response.body as { code?: string }).code).toBe("pickup.public_slots.overlap");
    const served = await schedule(id);
    expect(served.rules).toHaveLength(1);
    expect(served.rules[0]?.endTime).toBe("09:00");
  });

  it("refuse (400) un badge vide — `null` dit déjà « pas de pastille »", async () => {
    const id = await createPoint("Labo Paris");

    const response = await staff()
      .put(`/admin/pickup-addresses/${id}/creneaux-publics`)
      .send({ rules: [{ ...MORNING, badge: "" }], closures: [] });

    expect(response.status).toBe(400);
    expect((response.body as { code?: string }).code).toBe("pickup.public_slots.badge_empty");
    expect((await schedule(id)).rules).toHaveLength(0);
  });

  it("refuse (404) un point qui n'existe pas", async () => {
    await staff()
      .put("/admin/pickup-addresses/pickup_inconnu/creneaux-publics")
      .send({ rules: [MORNING], closures: [] })
      .expect(404);
    await staff().get("/admin/pickup-addresses/pickup_inconnu/creneaux-publics").expect(404);
  });
});

describe("créneaux publics de retrait — ce que la grille produit", () => {
  const DAY = serviceDay();
  /** Bien avant le jour de service : aucun créneau n'est « déjà passé ». */
  const BEFORE_DAY = new Date(`${DAY}T00:00:00.000Z`);

  it("une fermeture prime sur la règle du jour", async () => {
    const id = await createPoint("Labo Paris");

    await staff()
      .put(`/admin/pickup-addresses/${id}/creneaux-publics`)
      .send({
        rules: [MORNING],
        closures: [
          { fromDay: DAY, toDay: DAY, startTime: null, endTime: null, reason: "Four en panne" },
        ],
      })
      .expect(204);

    const served = await schedule(id);
    expect(served.closures).toHaveLength(1);
    expect(publicPickupSlotsFor(DAY, served.rules, served.closures, [], BEFORE_DAY)).toEqual([]);
  });

  /**
   * 🔴 La propriété que ce lot existe pour tenir (D3) : une capacité atteinte
   * ferme une heure et en propose une autre — jamais un créneau absent, jamais
   * un client sans issue.
   */
  it("une capacité atteinte laisse le créneau VISIBLE, fermé, avec la suivante ouverte", async () => {
    const id = await createPoint("Labo Paris");
    await staff()
      .put(`/admin/pickup-addresses/${id}/creneaux-publics`)
      .send({ rules: [MORNING], closures: [] })
      .expect(204);

    const served = await schedule(id);
    const slots = publicPickupSlotsFor(
      DAY,
      served.rules,
      served.closures,
      [{ time: "07:00", count: 2 }],
      BEFORE_DAY,
    );

    expect(slots.map((slot) => slot.time)).toEqual(["07:00", "07:30", "08:00", "08:30"]);
    expect(slots[0]).toMatchObject({ open: false, taken: 2, nextOpenTime: "07:30" });
    expect(slots[1]).toMatchObject({ open: true, badge: "Sortie du four" });
  });
});

/**
 * 🔴 D6 — un point **sans** créneaux publics se comporte exactement comme avant
 * ce chantier. C'est la propriété qui remplace toutes les préconditions : tant
 * qu'elle tient, ce lot ne peut casser aucun contrat servi.
 */
describe("créneaux publics de retrait — un point non réglé est inchangé", () => {
  it("rend deux listes vides, et aucun créneau public", async () => {
    const id = await createPoint("Labo Lyon");

    const served = await schedule(id);

    expect(served).toEqual({ rules: [], closures: [] });
    expect(
      publicPickupSlotsFor(serviceDay(), served.rules, served.closures, [], new Date(0)),
    ).toEqual([]);
  });

  it("sert toujours ses heures PRO sur la liste publique des points", async () => {
    const id = await createPoint("Labo Lyon");

    const response = await ctx.http().get("/pickup-addresses").expect(200);
    const points = jsonBody<readonly PickupAddressView[]>(response);

    expect(points.find((candidate) => candidate.id === id)?.opening).toEqual(PRO_OPENING);
  });

  it("régler les créneaux publics ne touche pas les heures PRO du point", async () => {
    const id = await createPoint("Labo Paris");

    await staff()
      .put(`/admin/pickup-addresses/${id}/creneaux-publics`)
      .send({ rules: [MORNING], closures: [] })
      .expect(204);

    const response = await ctx.http().get("/pickup-addresses").expect(200);
    const points = jsonBody<readonly PickupAddressView[]>(response);
    expect(points.find((candidate) => candidate.id === id)?.opening).toEqual(PRO_OPENING);
  });
});
