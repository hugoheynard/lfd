/**
 * E2E de la **lecture d'état de la procédure de prélèvement** (plan
 * `documentation/comptabilite/prelevement/plan-page-procedure-de-prelevement.md`,
 * S1, lot P2).
 *
 * Ce que seul le vrai SQL et le vrai HTTP prouvent : l'état des onglets 1 et 2
 * relu en base après chaque geste des cartes — sans rien stocker —, la lecture
 * sous `b2b_accounting` seule, et le 404 d'un lot que l'entité n'a pas.
 *
 * ⚠️ Mandats écrits par Prisma : même dette que `mandate-bank-exports.e2e-spec.ts`,
 * dont la mise en place est reprise. Aucune date absolue.
 */
import type {
  AccountBankExportCreatedView,
  CollectionProcedureListView,
  CollectionProcedureView,
} from "@lfd/contracts";

import { cycleToConstitute } from "../src/b2b/accounting/domain/services/billing-cycle.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

const ICS = "FR72ZZZ123456";
const ACCOUNT = {
  iban: "FR1420041010050500013M02606",
  bic: "CEPAFRPP751",
  holder: "Crazeativity",
  line1: "Route de la Balme",
  line2: "",
  postalCode: "73150",
  city: "Val d'Isère",
  countryCode: "FR",
};
const DEBTOR_IBAN = "FR7630004000031234567890143";
const DEBTOR_RIB = {
  iban: DEBTOR_IBAN,
  bic: "BNPAFRPP",
  holder: "Client e2e",
  line1: "1 rue du Test",
  line2: "",
  postalCode: "73000",
  city: "Chambéry",
  countryCode: "FR",
};
/** Signé il y a deux mois — comparé à rien d'autre qu'à sa cellule F. */
const SIGNED_AT = daysAgo(60);

/** Le jeton porteur EST le `sub` : le 403 de la seule lecture se joue en base. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let ctx: E2eContext;
let seq = 0;

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

function procedureOf(entityId: string, batchId?: string): string {
  const lot = batchId === undefined ? "" : `&batchId=${batchId}`;
  return `/admin/accounting/collection-procedure?legalEntityId=${entityId}${lot}`;
}

function exportsOf(entityId: string, kind: "account" | "mandate"): string {
  return `/admin/accounting/legal-entities/${entityId}/${kind}-exports`;
}

async function procedure(entityId: string): Promise<CollectionProcedureView> {
  return jsonBody<CollectionProcedureView>(await staff().get(procedureOf(entityId)).expect(200));
}

async function entity(siren: string, ics = ICS): Promise<string> {
  const response = await staff()
    .post("/admin/accounting/legal-entities")
    .send({
      name: "La Folie Douce",
      legalForm: "SAS",
      siren,
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
  const id = jsonBody<{ id: string }>(response).id;
  await staff()
    .put(`/admin/accounting/legal-entities/${id}/creditor-identifier`)
    .send({ ics })
    .expect(204);
  await staff()
    .put(`/admin/accounting/legal-entities/${id}/creditor-account`)
    .send(ACCOUNT)
    .expect(204);
  return id;
}

/** Une société avec son RIB, et un mandat actif chez l'entité. */
async function mandated(entityId: string, name: string): Promise<string> {
  seq += 1;
  const company = await createCompany(ctx.prisma, { raisonSociale: name });
  await staff().put(`/admin/companies/${company.id}/bank-account`).send(DEBTOR_RIB).expect(204);
  const mandate = await ctx.prisma.paymentMandate.create({
    data: {
      companyId: company.id,
      creditorId: entityId,
      reference: `RUM-EXP-${String(seq)}`,
      status: "active",
      acceptedAt: new Date(SIGNED_AT),
      scheme: "B2B",
      paymentType: "recurrent",
    },
  });
  return mandate.reference;
}

describe("la procédure de prélèvement — la lecture d'état", () => {
  it("se déverrouille au fil des gestes des cartes, relue en base à chaque lecture", async () => {
    const entityId = await entity("552100554");
    await mandated(entityId, "Café de l'Isère");

    const first = await procedure(entityId);
    expect(first.accounts).toMatchObject({ state: "to_do", toExportCount: 1 });
    expect(first.mandates.state).toBe("locked");
    expect(first.arrivalStep).toBe("accounts");

    const accountExport = jsonBody<AccountBankExportCreatedView>(
      await staff().post(exportsOf(entityId, "account")).expect(201),
    ).exportId;
    expect((await procedure(entityId)).accounts.state).toBe("waiting");

    // « Importé » ne se dit que d'un fichier téléchargé (règle de l'agrégat).
    await staff()
      .get(`${exportsOf(entityId, "account")}/${accountExport}/file.csv`)
      .expect(200);
    await staff()
      .post(`${exportsOf(entityId, "account")}/${accountExport}/imported`)
      .expect(204);
    const unlocked = await procedure(entityId);
    expect(unlocked.accounts.state).toBe("done");
    expect(unlocked.mandates).toMatchObject({ state: "to_do", toExportCount: 1 });
    expect(unlocked.file).toMatchObject({ mandatesNotImportedCount: 1 });
    expect(unlocked.arrivalStep).toBe("mandates");
  });

  it("se lit avec la seule lecture comptable", async () => {
    const entityId = await entity("552100554");
    const reader = await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: "lecture",
        email: "lecture@lfc.test",
        role: "communication",
        status: "active",
        auth0Id: "staff-lecture",
      },
    });
    await ctx.prisma.staffPermissionOverride.create({
      data: { staffUserId: reader.id, resource: "b2b_accounting", action: "read", effect: "allow" },
    });

    const view = jsonBody<CollectionProcedureView>(
      await ctx.asSub("staff-lecture").get(procedureOf(entityId)).expect(200),
    );
    expect(view.legalEntityId).toBe(entityId);
  });

  it("refuse (404) une entité inconnue, et un lot que l'entité n'a pas", async () => {
    const entityId = await entity("552100554");

    await staff().get(procedureOf("le_inconnue")).expect(404);
    await staff().get(procedureOf(entityId, "lot_inconnu")).expect(404);
  });
});

describe("« Retours contrôlés » — l'attestation du contrôle quotidien (P3)", () => {
  const CHECKS = "/admin/accounting/bank-return-checks";

  it("se pose une fois, se retire par une ligne de plus, et la procédure lit la dernière", async () => {
    const entityId = await entity("552100554");

    await staff().post(CHECKS).send({ legalEntityId: entityId }).expect(201);
    const attested = await procedure(entityId);
    expect(attested.returns.todayCheck).toMatchObject({ day: attested.returns.today });
    await staff().post(CHECKS).send({ legalEntityId: entityId }).expect(409);

    const today = attested.returns.today;
    await staff()
      .post(`${CHECKS}/withdrawn`)
      .send({ legalEntityId: entityId, day: today, note: "   " })
      .expect(400);
    await staff()
      .post(`${CHECKS}/withdrawn`)
      .send({ legalEntityId: entityId, day: today, note: "fichier de la veille" })
      .expect(201);

    expect((await procedure(entityId)).returns.todayCheck).toBeNull();
    expect(
      (await ctx.prisma.bankReturnCheck.findMany({ orderBy: { checkedAt: "asc" } })).map((row) => [
        row.withdrawn,
        row.note,
      ]),
    ).toEqual([
      [false, null],
      [true, "fichier de la veille"],
    ]);
  });

  /** Ce que seule la base prouve : le registre refuse qu'on modifie ou efface une ligne. */
  it("la base refuse de modifier ou d'effacer une attestation", async () => {
    const entityId = await entity("552100554");
    await staff().post(CHECKS).send({ legalEntityId: entityId }).expect(201);

    await expect(ctx.prisma.bankReturnCheck.deleteMany({})).rejects.toThrow(/append_only/u);
    await expect(
      ctx.prisma.bankReturnCheck.updateMany({ data: { withdrawn: true, note: "x" } }),
    ).rejects.toThrow(/append_only/u);
  });

  it("refuse un jour à venir (400) et une entité inconnue (404)", async () => {
    const entityId = await entity("552100554");
    const tomorrow = daysAgo(-2).slice(0, 10);

    await staff().post(CHECKS).send({ legalEntityId: entityId, day: tomorrow }).expect(400);
    await staff().post(CHECKS).send({ legalEntityId: "le_inconnue" }).expect(404);
  });

  it("refuse l'attestation à la seule lecture comptable (403)", async () => {
    const entityId = await entity("552100554");
    const reader = await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: "lecture",
        email: "lecture@lfc.test",
        role: "communication",
        status: "active",
        auth0Id: "staff-lecture",
      },
    });
    await ctx.prisma.staffPermissionOverride.create({
      data: { staffUserId: reader.id, resource: "b2b_accounting", action: "read", effect: "allow" },
    });

    await ctx.asSub("staff-lecture").post(CHECKS).send({ legalEntityId: entityId }).expect(403);
    expect(await ctx.prisma.bankReturnCheck.count()).toBe(0);
  });
});

describe("la procédure de prélèvement — la liste des procédures", () => {
  function listOf(entityId: string, includeClosed = false): string {
    const closed = includeClosed ? "&includeClosed=true" : "";
    return `/admin/accounting/collection-procedures?legalEntityId=${entityId}${closed}`;
  }

  it("liste la clôture à préparer et la prochaine du mensuel, et ouvre chacune par son id", async () => {
    const entityId = await entity("552100554");
    await mandated(entityId, "Café de l'Isère");

    const list = jsonBody<CollectionProcedureListView>(
      await staff().get(listOf(entityId, true)).expect(200),
    );

    expect(list.rows.map((row) => row.phase)).toEqual(["open", "upcoming"]);
    expect(list.rows.every((row) => row.id.startsWith(`${entityId}~`))).toBe(true);
    expect(list.rows[0]).toMatchObject({ stage: "accounts", followedBatchId: null });
    expect(list.rows[0]?.warnings).toContainEqual({ code: "accounts_to_export", count: 1 });

    const [open, upcoming] = list.rows;
    const opened = jsonBody<CollectionProcedureView>(
      await staff()
        .get(`/admin/accounting/collection-procedure?procedureId=${open?.id ?? ""}`)
        .expect(200),
    );
    expect(opened.toPrepare?.procedureId).toBe(open?.id);
    const ahead = jsonBody<CollectionProcedureView>(
      await staff()
        .get(`/admin/accounting/collection-procedure?procedureId=${upcoming?.id ?? ""}`)
        .expect(200),
    );
    expect(ahead.toPrepare).toBeNull();
    // Le code court se calcule du jour de clôture et des rythmes ; le détail dit le même.
    for (const [row, view] of [
      [open, opened],
      [upcoming, ahead],
    ] as const) {
      const day = (row?.closureDay ?? "").slice(2).replaceAll("-", "");
      expect(row?.code).toBe(`PRL-${day}-M`);
      expect(row?.closureModes).toEqual(["monthly"]);
      expect(view.procedure).toMatchObject({
        code: row?.code,
        closureDay: row?.closureDay,
        closureModes: ["monthly"],
        payerCounts: null,
      });
      expect(view.procedureBatches).toEqual([]);
    }
  });

  /**
   * Une clôture manquée (R4b) : l'automatisme a tenté l'avant-avant-dernière,
   * jamais l'avant-dernière, et aucun lot ne la couvre. Tentative écrite par
   * Prisma, comme `collection-autopilot.e2e-spec.ts` : la produire par le
   * passage demanderait de remonter l'horloge d'un mois.
   */
  it("met la clôture manquée en tête, et son détail renvoie au lot de la dernière", async () => {
    const entityId = await entity("552100554");
    const before = jsonBody<CollectionProcedureListView>(
      await staff().get(listOf(entityId)).expect(200),
    );
    const latest = before.rows.find((row) => row.phase === "open");
    const previous = cycleToConstitute(new Date(Date.parse(latest?.closesAt ?? "") - 1), null);
    const attempted = cycleToConstitute(new Date(previous.closesAt.getTime() - 1), null).closesAt;
    await ctx.prisma.collectionFloor.upsert({
      where: { id: true },
      update: { floorAt: new Date(attempted.getTime() - 1) },
      create: { id: true, floorAt: new Date(attempted.getTime() - 1) },
    });
    await ctx.prisma.collectionAutopilotRun.create({
      data: {
        legalEntityId: entityId,
        cycleClosesAt: attempted,
        ranAt: attempted,
        outcome: "nothing_to_collect",
      },
    });

    const list = jsonBody<CollectionProcedureListView>(
      await staff().get(listOf(entityId)).expect(200),
    );
    const [missed] = list.rows;
    expect(missed).toMatchObject({ phase: "missed", closesAt: previous.closesAt.toISOString() });
    expect(missed?.warnings).toEqual([{ code: "missed_closure", count: null }]);

    const detail = jsonBody<CollectionProcedureView>(
      await staff()
        .get(`/admin/accounting/collection-procedure?procedureId=${missed?.id ?? ""}`)
        .expect(200),
    );
    expect(detail.missed?.latestProcedureId).toBe(latest?.id);
    expect(detail.toPrepare).toBeNull();
  });

  it("refuse (404) une entité inconnue, et une adresse de procédure illisible", async () => {
    await staff().get(listOf("le_inconnue")).expect(404);
    await staff()
      .get("/admin/accounting/collection-procedure?procedureId=n_importe_quoi")
      .expect(404);
  });
});
