/**
 * E2E du **calendrier de prélèvement** de l'entité émettrice (plan
 * `documentation/facturation/plan-prelevement-automatique.md`, PA1).
 *
 * Ce que seul le vrai serveur prouve : les colonnes s'écrivent et se relisent
 * (une colonne oubliée dans le mapper rendrait « enregistré » puis l'ancienne
 * valeur), le refus « N < délai » traverse le filtre en 409 avec son message
 * entier, les faits tombent au journal, et la fiche porte le calendrier
 * calculé par le même code que le fichier.
 *
 * Aucune date absolue : le calendrier attendu est calculé par le domaine
 * depuis l'instant présent.
 */
import type { LegalEntityView } from "@lfd/contracts";

import { cycleAt } from "../src/b2b/accounting/domain/services/billing-cycle.js";
import { collectionCalendar } from "../src/b2b/accounting/domain/services/collection-calendar.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";

const SIREN = "552100554";
const BASE = "/admin/accounting/legal-entities";

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

async function declare(): Promise<string> {
  const response = await staff()
    .post(BASE)
    .send({
      name: "La Folie Douce",
      legalForm: "SAS",
      siren: SIREN,
      rcs: "",
      shareCapitalCents: 1_000_000,
      vatNumber: "",
      address: {
        line1: "12 rue du Fournil",
        line2: "",
        postalCode: "73000",
        city: "Chambéry",
        countryCode: "FR",
      },
    })
    .expect(201);
  return jsonBody<{ id: string }>(response).id;
}

async function read(id: string): Promise<LegalEntityView> {
  return jsonBody<LegalEntityView>(await staff().get(`${BASE}/${id}`).expect(200));
}

const SCHEDULE = {
  delayHours: 2,
  daysAfterClosure: 20,
  depositCutoff: { businessDaysBefore: 2, time: "16:00" },
};

describe("le calendrier de prélèvement de l'entité", () => {
  it("part des défauts qui ne changent rien, et porte le calendrier du cycle en cours", async () => {
    const id = await declare();

    const entity = await read(id);

    expect(entity).toMatchObject({
      autoCollectionEnabled: false,
      autoCollectionDelayHours: 1,
      collectionDaysAfterClosure: null,
      depositCutoff: null,
    });
    // Aucune clôture enregistrée : le cycle en cours se clôt au prochain 1er.
    const closure = cycleAt(new Date(daysAgo(0)), null).closesAt;
    const expected = collectionCalendar(closure, {
      preNotificationDays: 14,
      collectionDaysAfterClosure: null,
      autoCollectionDelayHours: 1,
      depositCutoff: null,
    });
    expect(entity.nextCollection).toEqual({
      closesAt: expected.closesAt.toISOString(),
      plannedConstitutionAt: expected.plannedConstitutionAt.toISOString(),
      collectionDay: expected.collectionDay,
      depositDeadline: null,
    });
  });

  it("s'écrit, se relit, et journalise l'après", async () => {
    const id = await declare();

    await staff().put(`${BASE}/${id}/collection-schedule`).send(SCHEDULE).expect(204);

    const entity = await read(id);
    expect(entity).toMatchObject({
      autoCollectionDelayHours: 2,
      collectionDaysAfterClosure: 20,
      depositCutoff: { businessDaysBefore: 2, time: "16:00" },
    });
    expect(entity.nextCollection.depositDeadline?.time).toBe("16:00");
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: id, type: "legal_entity.collection_schedule_changed" },
      select: { payload: true },
    });
    expect(facts).toEqual([
      {
        payload: {
          subjectLabel: "La Folie Douce",
          delayHours: 2,
          daysAfterClosure: 20,
          depositCutoffBusinessDays: 2,
          depositCutoffTime: "16:00",
        },
      },
    ]);
  });

  it("refuse en 409 une échéance plus courte que le délai, en nommant les deux et la clause", async () => {
    const id = await declare();

    const response = await staff()
      .put(`${BASE}/${id}/collection-schedule`)
      .send({ ...SCHEDULE, daysAfterClosure: 4 })
      .expect(409);

    expect(response.text).toContain("clôture + 4 jours");
    expect(response.text).toContain("14 jours");
    expect(response.text).toContain("CGV");
    expect((await read(id)).collectionDaysAfterClosure).toBeNull();
  });

  it("refuse en 409 de porter le délai de pré-notification au-dessus d'une échéance réglée", async () => {
    const id = await declare();
    await staff().put(`${BASE}/${id}/collection-schedule`).send(SCHEDULE).expect(204);

    await staff().put(`${BASE}/${id}/pre-notification`).send({ days: 21 }).expect(409);

    expect((await read(id)).preNotificationDays).toBe(14);
  });

  it("refuse en 400 un délai de constitution qui passerait au lendemain", async () => {
    const id = await declare();

    await staff()
      .put(`${BASE}/${id}/collection-schedule`)
      .send({ ...SCHEDULE, delayHours: 24 })
      .expect(400);
  });
});

describe("la constitution automatique", () => {
  it("s'active et se désactive, chaque bascule étant un fait distinct", async () => {
    const id = await declare();

    await staff().put(`${BASE}/${id}/auto-collection`).send({ enabled: true }).expect(204);
    expect((await read(id)).autoCollectionEnabled).toBe(true);
    await staff().put(`${BASE}/${id}/auto-collection`).send({ enabled: false }).expect(204);

    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: id, type: { startsWith: "legal_entity.auto_collection" } },
      orderBy: { id: "asc" },
      select: { type: true },
    });
    expect(facts.map((fact) => fact.type)).toEqual([
      "legal_entity.auto_collection_enabled",
      "legal_entity.auto_collection_disabled",
    ]);
  });
});
