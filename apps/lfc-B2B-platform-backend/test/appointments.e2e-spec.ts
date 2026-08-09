/**
 * E2E de la **prise de rendez-vous** — vrai Postgres.
 *
 * Ce que seul le vrai SQL prouve, et qui est tout l'enjeu de cette tranche :
 * - l'**index unique partiel** tient sous **concurrence réelle** — deux
 *   réservations simultanées du même créneau donnent une 201 et une 409, jamais
 *   deux rendez-vous ni un 500 ;
 * - un rendez-vous **annulé libère** son créneau (c'est la clause `WHERE status
 *   <> 'cancelled'` de l'index, invisible pour un test unitaire) ;
 * - la **revalidation serveur** refuse un instant qui n'est pas un créneau
 *   ouvert, même si le client l'invente ;
 * - le **mur** : on ne pose pas un rendez-vous sur une société dont on n'est pas
 *   membre, et on n'annule pas celui d'un autre.
 */
import type {
  AppointmentView,
  AvailabilityConfigPayload,
  AvailabilityConfigView,
  CreatedAppointmentResponse,
  SlotsView,
} from "@lfd/contracts";
import { CustomerRole } from "../src/infra/database/client/client.js";

import { AdminTokenVerifier } from "../src/infra/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const OWNER = "auth0|owner";
const STRANGER = "auth0|stranger";

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

function staff(): ReturnType<E2eContext["http"]> {
  return ctx.http().set("Authorization", "Bearer staff-e2e");
}

/** Une disponibilité large : tous les jours 08:00–18:00, sans prévenance. */
const OPEN_CONFIG: AvailabilityConfigPayload = {
  rules: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    startTime: "08:00",
    endTime: "18:00",
  })),
  exceptions: [],
  policy: { slotMinutes: 30, leadTimeHours: 0, horizonDays: 30, channels: ["phone", "visio"] },
};

/** Déclare la disponibilité côté staff, comme le ferait l'écran de réglages. */
async function declareAvailability(
  config: AvailabilityConfigPayload = OPEN_CONFIG,
): Promise<AvailabilityConfigView> {
  const response = await staff().put("/admin/availability").send(config).expect(200);
  return jsonBody<AvailabilityConfigView>(response);
}

/** La fenêtre de jours locaux demandée aux créneaux : demain → dans 8 jours. */
function window(): { from: string; to: string } {
  const day = (offset: number): string => {
    const date = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 10);
  };
  return { from: day(1), to: day(8) };
}

/** Le premier créneau réservable, tel que l'API le propose. */
async function firstSlot(): Promise<string> {
  const { from, to } = window();
  const response = await ctx
    .asSub(OWNER)
    .get(`/appointments/slots?from=${from}&to=${to}`)
    .expect(200);
  const view = jsonBody<SlotsView>(response);
  const slot = view.slots[0];
  if (slot === undefined) {
    throw new Error("aucun créneau proposé — la disponibilité n'a pas été déclarée ?");
  }
  return slot.startAt;
}

/** Sème le client, un étranger, et une société dont seul le client est membre. */
async function seedAccounts(): Promise<string> {
  const owner = await createUser(ctx.prisma, { auth0Sub: OWNER });
  await createUser(ctx.prisma, { auth0Sub: STRANGER });
  const company = await createCompany(ctx.prisma, { status: "active" });
  await attachTo(ctx.prisma, owner.id, company.id, CustomerRole.company_admin);
  return company.id;
}

describe("les créneaux", () => {
  it("ne propose rien tant que le commercial n'a rien déclaré", async () => {
    await seedAccounts();
    const { from, to } = window();
    const response = await ctx
      .asSub(OWNER)
      .get(`/appointments/slots?from=${from}&to=${to}`)
      .expect(200);
    expect(jsonBody<SlotsView>(response).slots).toEqual([]);
  });

  it("propose les créneaux dès que la grille est déclarée, avec ses canaux", async () => {
    await seedAccounts();
    await declareAvailability();
    const { from, to } = window();
    const response = await ctx
      .asSub(OWNER)
      .get(`/appointments/slots?from=${from}&to=${to}`)
      .expect(200);
    const view = jsonBody<SlotsView>(response);
    expect(view.slots.length).toBeGreaterThan(0);
    expect(view.channels).toEqual(["phone", "visio"]);
    expect(view.slotMinutes).toBe(30);
    // La lecture locale est calculée serveur : elle doit être là, et cohérente.
    expect(view.slots[0]?.time).toMatch(/^\d{2}:\d{2}$/u);
  });

  it("l'aperçu admin rend exactement les mêmes créneaux que le client", async () => {
    await seedAccounts();
    await declareAvailability();
    const { from, to } = window();
    const [client, admin] = await Promise.all([
      ctx.asSub(OWNER).get(`/appointments/slots?from=${from}&to=${to}`).expect(200),
      staff().get(`/admin/availability/slots?from=${from}&to=${to}`).expect(200),
    ]);
    expect(jsonBody<SlotsView>(admin).slots).toEqual(jsonBody<SlotsView>(client).slots);
  });

  it("retire du catalogue un créneau qui vient d'être réservé", async () => {
    await seedAccounts();
    await declareAvailability();
    const startAt = await firstSlot();
    await ctx
      .asSub(OWNER)
      .post("/appointments")
      .send({ startAt, channel: "phone", companyId: null })
      .expect(201);
    const { from, to } = window();
    const response = await ctx
      .asSub(OWNER)
      .get(`/appointments/slots?from=${from}&to=${to}`)
      .expect(200);
    expect(jsonBody<SlotsView>(response).slots.some((s) => s.startAt === startAt)).toBe(false);
  });
});

describe("la réservation", () => {
  it("persiste le rendez-vous en « requested » et le rend dans « mes rendez-vous »", async () => {
    await seedAccounts();
    await declareAvailability();
    const startAt = await firstSlot();
    const created = await ctx
      .asSub(OWNER)
      .post("/appointments")
      .send({ startAt, channel: "visio", companyId: null, message: "besoin d'aide" })
      .expect(201);
    const { id } = jsonBody<CreatedAppointmentResponse>(created);
    expect(id).toMatch(/^appt_/u);

    const mine = await ctx.asSub(OWNER).get("/appointments/mine").expect(200);
    const rows = jsonBody<AppointmentView[]>(mine);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id,
      status: "requested",
      channel: "visio",
      subjectType: "user",
      message: "besoin d'aide",
    });
  });

  it("rattache le rendez-vous à la société quand le client en désigne une", async () => {
    const companyId = await seedAccounts();
    await declareAvailability();
    const startAt = await firstSlot();
    await ctx
      .asSub(OWNER)
      .post("/appointments")
      .send({ startAt, channel: "phone", companyId })
      .expect(201);
    const mine = await ctx.asSub(OWNER).get("/appointments/mine").expect(200);
    expect(jsonBody<AppointmentView[]>(mine)[0]).toMatchObject({
      subjectType: "company",
      subjectId: companyId,
    });
  });

  it("refuse une société dont le demandeur n'est pas membre (404 non-divulguant)", async () => {
    const companyId = await seedAccounts();
    await declareAvailability();
    const startAt = await firstSlot();
    await ctx
      .asSub(STRANGER)
      .post("/appointments")
      .send({ startAt, channel: "phone", companyId })
      .expect(404);
    expect(await ctx.prisma.appointment.count()).toBe(0);
  });

  it("refuse un instant qui n'est pas un créneau ouvert (409)", async () => {
    await seedAccounts();
    await declareAvailability();
    const startAt = await firstSlot();
    // Décalé de 7 minutes : plausible, mais ce n'est pas un créneau.
    const invented = new Date(new Date(startAt).getTime() + 7 * 60 * 1000).toISOString();
    await ctx
      .asSub(OWNER)
      .post("/appointments")
      .send({ startAt: invented, channel: "phone", companyId: null })
      .expect(409);
    expect(await ctx.prisma.appointment.count()).toBe(0);
  });

  it("refuse un créneau sous le délai de prévenance", async () => {
    await seedAccounts();
    await declareAvailability({
      ...OPEN_CONFIG,
      policy: { ...OPEN_CONFIG.policy, leadTimeHours: 0 },
    });
    const startAt = await firstSlot();
    // On resserre la prévenance APRÈS avoir lu le créneau : il devient hors
    // d'atteinte sans que le client l'ait vu changer — exactement le cas réel.
    await declareAvailability({
      ...OPEN_CONFIG,
      policy: { ...OPEN_CONFIG.policy, leadTimeHours: 720 },
    });
    await ctx
      .asSub(OWNER)
      .post("/appointments")
      .send({ startAt, channel: "phone", companyId: null })
      .expect(409);
  });

  it("refuse un jeton absent (401)", async () => {
    await seedAccounts();
    await declareAvailability();
    const startAt = await firstSlot();
    await ctx.http().post("/appointments").send({ startAt, channel: "phone" }).expect(401);
  });
});

describe("l'exclusivité du créneau", () => {
  it("deux réservations CONCURRENTES du même créneau : une 201, une 409", async () => {
    await seedAccounts();
    await declareAvailability();
    const startAt = await firstSlot();
    const book = (sub: string): Promise<{ status: number }> =>
      ctx.asSub(sub).post("/appointments").send({ startAt, channel: "phone", companyId: null });

    // Lancées ensemble : elles passent toutes deux la revalidation applicative
    // avant qu'aucune n'ait écrit. Seul l'index unique partiel les départage.
    const results = await Promise.all([book(OWNER), book(STRANGER)]);
    const statuses = results.map((r) => r.status).sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);
    expect(await ctx.prisma.appointment.count()).toBe(1);
  });

  it("un rendez-vous ANNULÉ libère son créneau", async () => {
    await seedAccounts();
    await declareAvailability();
    const startAt = await firstSlot();
    const created = await ctx
      .asSub(OWNER)
      .post("/appointments")
      .send({ startAt, channel: "phone", companyId: null })
      .expect(201);
    const { id } = jsonBody<CreatedAppointmentResponse>(created);

    await staff()
      .patch(`/admin/appointments/${id}`)
      .send({ status: "cancelled", reason: "client injoignable" })
      .expect(204);

    // Le même créneau redevient réservable — c'est la clause WHERE de l'index.
    await ctx
      .asSub(STRANGER)
      .post("/appointments")
      .send({ startAt, channel: "phone", companyId: null })
      .expect(201);
    expect(await ctx.prisma.appointment.count()).toBe(2);
  });
});

describe("l'annulation par le client", () => {
  it("annule son propre rendez-vous et libère le créneau", async () => {
    await seedAccounts();
    await declareAvailability();
    const startAt = await firstSlot();
    const created = await ctx
      .asSub(OWNER)
      .post("/appointments")
      .send({ startAt, channel: "phone", companyId: null })
      .expect(201);
    const { id } = jsonBody<CreatedAppointmentResponse>(created);

    await ctx.asSub(OWNER).delete(`/appointments/${id}`).expect(204);
    const mine = await ctx.asSub(OWNER).get("/appointments/mine").expect(200);
    expect(jsonBody<AppointmentView[]>(mine)).toEqual([]);
  });

  it("n'annule pas le rendez-vous d'un autre (404 non-divulguant)", async () => {
    await seedAccounts();
    await declareAvailability();
    const startAt = await firstSlot();
    const created = await ctx
      .asSub(OWNER)
      .post("/appointments")
      .send({ startAt, channel: "phone", companyId: null })
      .expect(201);
    const { id } = jsonBody<CreatedAppointmentResponse>(created);

    await ctx.asSub(STRANGER).delete(`/appointments/${id}`).expect(404);
    expect(await ctx.prisma.appointment.count({ where: { status: "requested" } })).toBe(1);
  });

  it("refuse l'annulation en ligne passé le délai de prévenance", async () => {
    await seedAccounts();
    await declareAvailability();
    const startAt = await firstSlot();
    const created = await ctx
      .asSub(OWNER)
      .post("/appointments")
      .send({ startAt, channel: "phone", companyId: null })
      .expect(201);
    const { id } = jsonBody<CreatedAppointmentResponse>(created);

    // Le commercial resserre sa prévenance à 30 jours : le rendez-vous tombe
    // dedans, l'annulation en ligne n'est plus possible.
    await declareAvailability({
      ...OPEN_CONFIG,
      policy: { ...OPEN_CONFIG.policy, leadTimeHours: 720 },
    });
    await ctx.asSub(OWNER).delete(`/appointments/${id}`).expect(409);
  });
});

describe("la surface staff", () => {
  it("mure les routes (401 sans jeton staff)", async () => {
    await ctx.http().get("/admin/availability").expect(401);
    await ctx.http().get("/admin/appointments?from=2026-01-01&to=2027-01-01").expect(401);
  });

  it("enregistre la disponibilité en bloc et la relit", async () => {
    const saved = await declareAvailability({
      rules: [{ weekday: 2, startTime: "09:00", endTime: "12:00" }],
      exceptions: [
        { day: "2026-12-25", kind: "closed", startTime: null, endTime: null, reason: "Noël" },
      ],
      policy: { slotMinutes: 45, leadTimeHours: 12, horizonDays: 15, channels: ["onsite"] },
    });
    expect(saved.rules).toHaveLength(1);
    expect(saved.exceptions[0]).toMatchObject({
      day: "2026-12-25",
      kind: "closed",
      reason: "Noël",
    });
    expect(saved.policy).toEqual({
      slotMinutes: 45,
      leadTimeHours: 12,
      horizonDays: 15,
      channels: ["onsite"],
    });

    const reread = await staff().get("/admin/availability").expect(200);
    expect(jsonBody<AvailabilityConfigView>(reread)).toEqual(saved);
  });

  it("remplace la grille au lieu de l'empiler", async () => {
    await declareAvailability();
    const saved = await declareAvailability({
      rules: [{ weekday: 1, startTime: "09:00", endTime: "10:00" }],
      exceptions: [],
      policy: OPEN_CONFIG.policy,
    });
    expect(saved.rules).toHaveLength(1);
    expect(await ctx.prisma.availabilityRule.count()).toBe(1);
  });

  it("enregistre la SEULE politique sans toucher à la grille ni aux exceptions", async () => {
    await declareAvailability({
      rules: [{ weekday: 2, startTime: "09:00", endTime: "12:00" }],
      exceptions: [
        { day: "2026-12-25", kind: "closed", startTime: null, endTime: null, reason: "Noël" },
      ],
      policy: { slotMinutes: 30, leadTimeHours: 24, horizonDays: 30, channels: ["phone"] },
    });

    const response = await staff()
      .put("/admin/availability/policy")
      .send({ slotMinutes: 60, leadTimeHours: 2, horizonDays: 90, channels: ["visio", "onsite"] })
      .expect(200);

    const saved = jsonBody<AvailabilityConfigView>(response);
    expect(saved.policy).toEqual({
      slotMinutes: 60,
      leadTimeHours: 2,
      horizonDays: 90,
      channels: ["visio", "onsite"],
    });
    // Le point de la route : la grille et les exceptions sont intactes.
    expect(saved.rules).toHaveLength(1);
    expect(saved.rules[0]).toMatchObject({ weekday: 2, startTime: "09:00", endTime: "12:00" });
    expect(saved.exceptions[0]).toMatchObject({ day: "2026-12-25", reason: "Noël" });
    expect(await ctx.prisma.availabilityRule.count()).toBe(1);
  });

  it("refuse une politique sans aucun canal (400)", async () => {
    await staff()
      .put("/admin/availability/policy")
      .send({ slotMinutes: 30, leadTimeHours: 24, horizonDays: 30, channels: [] })
      .expect(400);
  });

  it("pose un rendez-vous directement confirmé, y compris sur un lead sans société", async () => {
    await declareAvailability();
    const startAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const created = await staff()
      .post("/admin/appointments")
      .send({
        startAt,
        channel: "phone",
        subjectType: "lead",
        subjectId: "lead_123",
        contactName: "Camille",
      })
      .expect(201);
    const { id } = jsonBody<CreatedAppointmentResponse>(created);

    const list = await staff()
      .get(`/admin/appointments?from=${new Date(0).toISOString()}&to=${farFuture()}`)
      .expect(200);
    expect(jsonBody<AppointmentView[]>(list)[0]).toMatchObject({
      id,
      status: "confirmed",
      subjectType: "lead",
      subjectId: "lead_123",
    });
  });

  it("fait avancer un rendez-vous, et refuse ce que le domaine interdit", async () => {
    await declareAvailability();
    const startAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const created = await staff()
      .post("/admin/appointments")
      .send({ startAt, channel: "phone", subjectType: "lead", subjectId: "lead_1" })
      .expect(201);
    const { id } = jsonBody<CreatedAppointmentResponse>(created);

    // Pas encore eu lieu → on ne peut pas le déclarer honoré.
    await staff().patch(`/admin/appointments/${id}`).send({ status: "honored" }).expect(409);
    // Annuler sans motif → 400 (le contrat l'exige).
    await staff().patch(`/admin/appointments/${id}`).send({ status: "cancelled" }).expect(400);
    // Annuler avec motif → passe, et devient définitif.
    await staff()
      .patch(`/admin/appointments/${id}`)
      .send({ status: "cancelled", reason: "reporté" })
      .expect(204);
    await staff().patch(`/admin/appointments/${id}`).send({ status: "confirmed" }).expect(409);
  });

  it("rend 404 sur un rendez-vous inconnu", async () => {
    await staff()
      .patch("/admin/appointments/appt_inconnu")
      .send({ status: "confirmed" })
      .expect(404);
  });
});

/** Une borne haute large, pour lire toute la file sans se soucier des dates. */
function farFuture(): string {
  return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
}
