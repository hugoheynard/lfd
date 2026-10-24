/**
 * E2E de la procédure de prélèvement — **la lecture d'état** et l'attestation des retours
 * contrôlés (P3).
 *
 * Découpé de `collection-procedure.e2e-spec.ts` le 2026-10-23 ; la scène
 * commune vit dans `collection-procedure-scene.ts`.
 */
import type {
  AccountBankExportCreatedView,
  CollectionProcedureView,
  MandateBankExportCreatedView,
} from "@lfd/contracts";
import { daysAgo, jsonBody } from "./e2e-harness.js";
import {
  ctx,
  entity,
  exportsOf,
  lotCarrying,
  mandated,
  procedure,
  procedureOf,
  staff,
  useCollectionProcedureScene,
} from "./collection-procedure-scene.js";

useCollectionProcedureScene();

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

/** Exporte, télécharge et marque importé : « importé » ne se dit que d'un fichier sorti. */
async function importAtBank(entityId: string, kind: "account" | "mandate"): Promise<void> {
  const created = await staff().post(exportsOf(entityId, kind)).send({}).expect(201);
  const exportId = jsonBody<AccountBankExportCreatedView | MandateBankExportCreatedView>(
    created,
  ).exportId;
  await staff()
    .get(`${exportsOf(entityId, kind)}/${exportId}/file.csv`)
    .expect(200);
  await staff()
    .post(`${exportsOf(entityId, kind)}/${exportId}/imported`)
    .expect(204);
}

describe("l'onglet 3 nomme les débiteurs du lot absents de CENET (P4 révisé)", () => {
  it("un débiteur au mandat jamais exporté est nommé ; une fois tout importé, plus rien", async () => {
    const entityId = await entity("552100554");
    const reference = await mandated(entityId, "Café de l'Isère");
    const batchId = await lotCarrying(entityId, reference);

    const before = jsonBody<CollectionProcedureView>(
      await staff().get(procedureOf(entityId, batchId)).expect(200),
    );
    expect(before.file.debtorsNotImported).toEqual([
      {
        batchId,
        scheme: "B2B",
        debtorName: "Café de l'Isère",
        mandateReference: reference,
        account: "not_exported",
        mandate: "not_exported",
      },
    ]);

    await importAtBank(entityId, "account");
    await importAtBank(entityId, "mandate");

    const after = jsonBody<CollectionProcedureView>(
      await staff().get(procedureOf(entityId, batchId)).expect(200),
    );
    expect(after.file.debtorsNotImported).toEqual([]);
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
