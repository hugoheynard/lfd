/**
 * E2E du **compte de l'entité aux quatre yeux** (plan
 * `plan-paiement-au-compte-par-virement.md`, T0).
 *
 * Ce que seul un e2e prouve : le compte qui part dans le `CdtrAcct` du
 * `pain.008` et dans l'instantané que les factures copient est le compte
 * CONFIRMÉ, relu de la base ; la proposition en attente ne fuit par aucune
 * route ; la confirmation est refusée à son auteur, désigné par sa fiche, et à
 * un IBAN ressaisi différent ; et le verrou de version refuse une écriture
 * périmée en 409, à travers le vrai SQL.
 */
import type { LegalEntityView } from "@lfd/contracts";

import { CreditorReader } from "../src/lafoliecoffee/accounting/domain/ports/creditor.reader.js";
import { LegalEntityRepository } from "../src/lafoliecoffee/accounting/domain/ports/legal-entity.repository.js";
import { LegalEntityChangedConcurrentlyError } from "../src/lafoliecoffee/accounting/domain/errors/creditor-account-review-errors.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_ID, jsonBody, type E2eContext } from "./e2e-harness.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

const SIREN = "552100554";
const ICS = "FR72ZZZ123456";
/** IBAN d'exemple de la documentation EPC — clé mod-97 valide. */
const OLD_IBAN = "FR1420041010050500013M02606";
const NEW_IBAN = "FR7630006000011234567890189";
const OTHER_IBAN = "FR7630004000031234567890143";

const ACCOUNT = {
  iban: OLD_IBAN,
  bic: "CEPAFRPP751",
  holder: "Crazeativity",
  line1: "Route de la Balme",
  line2: "",
  postalCode: "73150",
  city: "Val d'Isère",
  countryCode: "FR",
};

/** Le jeton porteur EST le `sub` : deux membres du staff, deux jetons. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const SECOND_SUB = "staff-second";
const ENTITIES = "/admin/accounting/legal-entities";

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
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Seconde",
      lastName: "Comptable",
      email: "seconde@lfc.test",
      role: "admin",
      status: "active",
      auth0Id: SECOND_SUB,
    },
  });
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

function second(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub(SECOND_SUB);
}

/** Une entité qui encaisse : ICS et premier compte, posés par l'opérateur. */
async function collectingEntity(): Promise<string> {
  const response = await staff()
    .post(ENTITIES)
    .set(INTENT_KEY, freshIntent())
    .send({
      name: "La Folie Douce",
      legalForm: "SAS",
      siren: SIREN,
      rcs: "",
      shareCapitalCents: 0,
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
  const id = jsonBody<{ id: string }>(response).id;
  await staff().put(`${ENTITIES}/${id}/creditor-identifier`).send({ ics: ICS }).expect(204);
  await staff().put(`${ENTITIES}/${id}/creditor-account`).send(ACCOUNT).expect(204);
  return id;
}

async function view(id: string): Promise<LegalEntityView> {
  return jsonBody<LegalEntityView>(await staff().get(`${ENTITIES}/${id}`).expect(200));
}

/** L'opérateur propose `iban` ; rend l'identifiant de la saisie en attente. */
async function propose(id: string, iban: string): Promise<string> {
  await staff()
    .put(`${ENTITIES}/${id}/creditor-account`)
    .send({ ...ACCOUNT, iban })
    .expect(204);
  const pending = (await view(id)).pendingCreditorAccount;
  expect(pending).not.toBeNull();
  return pending!.id;
}

/** Le `pain.008` du cycle en cours : son `CdtrAcct` est le compte qui reçoit. */
async function draftXml(id: string): Promise<string> {
  const response = await staff()
    .get(`/admin/accounting/billing-cycle/draft.xml?legalEntityId=${id}`)
    .expect(200);
  return response.text;
}

describe("Compte de l'entité — la première saisie", () => {
  it("est immédiate : l'entité encaisse sur ce compte, rien n'attend", async () => {
    const id = await collectingEntity();

    const entity = await view(id);
    expect(entity).toMatchObject({ canCollect: true, creditorAccountLast4: "2606" });
    expect(entity.pendingCreditorAccount).toBeNull();
    expect(await draftXml(id)).toContain(`<IBAN>${OLD_IBAN}</IBAN>`);
  });
});

describe("Compte de l'entité — une modification attend un second membre", () => {
  it("garde l'ancien compte pour le pain.008 et les factures, et montre l'attente", async () => {
    const id = await collectingEntity();

    await propose(id, NEW_IBAN);

    const entity = await view(id);
    expect(entity.creditorAccountLast4).toBe("2606");
    expect(entity.pendingCreditorAccount).toMatchObject({
      last4: "0189",
      proposedByStaffId: E2E_STAFF_ID,
      proposedByName: "Opérateur E2E",
    });
    // 🔴 Ni l'un ni l'autre IBAN ne sort en entier.
    const body = JSON.stringify(entity);
    expect(body).not.toContain(NEW_IBAN);
    expect(body).not.toContain(OLD_IBAN);

    const xml = await draftXml(id);
    expect(xml).toContain(`<IBAN>${OLD_IBAN}</IBAN>`);
    expect(xml).not.toContain(NEW_IBAN);
    // L'instantané que l'émission des factures copie.
    const snapshot = await ctx.app.get(CreditorReader).snapshot(id);
    expect(snapshot?.creditorIban).toBe(OLD_IBAN);

    // En base, la proposition est scellée comme le compte confirmé.
    const row = await ctx.prisma.legalEntity.findUniqueOrThrow({ where: { id } });
    expect(JSON.stringify(row)).not.toContain(NEW_IBAN);
    expect(row.pendingCreditorIbanSealed?.startsWith("v1.")).toBe(true);
  });

  it("sonne la cloche de la comptabilité à la proposition", async () => {
    const id = await collectingEntity();

    const pendingId = await propose(id, NEW_IBAN);
    await ctx.drain();

    const bell = await ctx.prisma.staffNotification.findMany({
      where: { kind: "legal_entity.creditor_account_proposed" },
    });
    expect(bell.map((row) => row.idempotencyKey)).toEqual([
      `notification:legal_entity.creditor_account_proposed:${pendingId}`,
    ]);
    expect(JSON.stringify(bell)).not.toContain(NEW_IBAN);
  });
});

describe("Compte de l'entité — la confirmation", () => {
  it("par un autre membre qui ressaisit l'IBAN : le nouveau compte part au pain.008", async () => {
    const id = await collectingEntity();
    const pendingId = await propose(id, NEW_IBAN);

    await second()
      .post(`${ENTITIES}/${id}/creditor-account/pending/${pendingId}/confirm`)
      .send({ iban: NEW_IBAN })
      .expect(204);

    const entity = await view(id);
    expect(entity.creditorAccountLast4).toBe("0189");
    expect(entity.pendingCreditorAccount).toBeNull();
    expect(await draftXml(id)).toContain(`<IBAN>${NEW_IBAN}</IBAN>`);
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: { startsWith: "legal_entity.creditor_account" } },
    });
    // La première saisie et la confirmation changent le compte ; entre les deux, la proposition.
    expect(facts.map((fact) => fact.type).sort()).toEqual([
      "legal_entity.creditor_account_changed",
      "legal_entity.creditor_account_changed",
      "legal_entity.creditor_account_proposed",
    ]);
    expect(JSON.stringify(facts)).not.toContain(NEW_IBAN);
  });

  it("REFUSE en 409 la confirmation par l'auteur de la saisie", async () => {
    const id = await collectingEntity();
    const pendingId = await propose(id, NEW_IBAN);

    const response = await staff()
      .post(`${ENTITIES}/${id}/creditor-account/pending/${pendingId}/confirm`)
      .send({ iban: NEW_IBAN })
      .expect(409);

    expect(jsonBody<{ code: string }>(response).code).toBe(
      "accounting.creditor_account.self_confirmation",
    );
    expect((await view(id)).creditorAccountLast4).toBe("2606");
  });

  it("REFUSE en 409 un IBAN ressaisi différent, sans dire lequel", async () => {
    const id = await collectingEntity();
    const pendingId = await propose(id, NEW_IBAN);

    const response = await second()
      .post(`${ENTITIES}/${id}/creditor-account/pending/${pendingId}/confirm`)
      .send({ iban: OTHER_IBAN })
      .expect(409);

    expect(jsonBody<{ code: string }>(response).code).toBe(
      "accounting.creditor_account.iban_mismatch",
    );
    expect(JSON.stringify(response.body)).not.toContain(NEW_IBAN);
    expect(JSON.stringify(response.body)).not.toContain(OTHER_IBAN);
    expect((await view(id)).creditorAccountLast4).toBe("2606");
  });

  it("REFUSE en 409 une saisie remplacée entre-temps", async () => {
    const id = await collectingEntity();
    const replaced = await propose(id, NEW_IBAN);
    await propose(id, OTHER_IBAN);

    const response = await second()
      .post(`${ENTITIES}/${id}/creditor-account/pending/${replaced}/confirm`)
      .send({ iban: NEW_IBAN })
      .expect(409);

    expect(jsonBody<{ code: string }>(response).code).toBe(
      "accounting.creditor_account.pending_gone",
    );
  });

  it("annule une saisie, et une saisie annulée ne se confirme plus", async () => {
    const id = await collectingEntity();
    const pendingId = await propose(id, NEW_IBAN);

    await second().delete(`${ENTITIES}/${id}/creditor-account/pending/${pendingId}`).expect(204);
    await second()
      .post(`${ENTITIES}/${id}/creditor-account/pending/${pendingId}/confirm`)
      .send({ iban: NEW_IBAN })
      .expect(409);
    await second().delete(`${ENTITIES}/${id}/creditor-account/pending/${pendingId}`).expect(409);

    const entity = await view(id);
    expect(entity.pendingCreditorAccount).toBeNull();
    expect(entity.creditorAccountLast4).toBe("2606");
  });
});

describe("Entité juridique — le verrou de version", () => {
  it("refuse l'écriture d'une entité lue avant une autre écriture", async () => {
    const id = await collectingEntity();
    const repository = ctx.app.get(LegalEntityRepository);
    const stale = await repository.load(id);

    await propose(id, NEW_IBAN);
    stale!.setPreNotificationDays(10);

    await expect(repository.save(stale!)).rejects.toBeInstanceOf(
      LegalEntityChangedConcurrentlyError,
    );
    const row = await ctx.prisma.legalEntity.findUniqueOrThrow({ where: { id } });
    expect(row.preNotificationDays).not.toBe(10);
    expect(row.pendingCreditorAccountId).not.toBeNull();
  });

  it("deux gestes concurrents : l'un passe, l'autre est refusé en 409, rien n'est écrasé", async () => {
    const id = await collectingEntity();
    const repository = ctx.app.get(LegalEntityRepository);
    const first = await repository.load(id);
    const late = await repository.load(id);

    first!.setPreNotificationDays(10);
    await repository.save(first!);
    late!.setPreNotificationDays(20);

    await expect(repository.save(late!)).rejects.toMatchObject({
      code: "accounting.legal_entity.changed_concurrently",
    });
    const row = await ctx.prisma.legalEntity.findUniqueOrThrow({ where: { id } });
    expect(row.preNotificationDays).toBe(10);
  });

  it("une même entité sauvée deux fois de suite ne se croit pas périmée", async () => {
    const id = await collectingEntity();
    const repository = ctx.app.get(LegalEntityRepository);
    const entity = await repository.load(id);

    entity!.setPreNotificationDays(10);
    await repository.save(entity!);
    entity!.setPreNotificationDays(12);
    await repository.save(entity!);

    const row = await ctx.prisma.legalEntity.findUniqueOrThrow({ where: { id } });
    expect(row.preNotificationDays).toBe(12);
  });
});
