/**
 * E2E de l'outil de prélèvement d'essai — **le RIB de l'établissement pour la
 * banque** (décision de Hugo du 2026-10-26) : le fichier des comptes
 * destinataires d'une ligne, au rendu de l'export des RIB, sans figer ni
 * marquer aucun export, et journalisé.
 */
import type { AccountBankExportsView } from "@lfd/contracts";
import { jsonBody } from "./e2e-harness.js";
import {
  ACCOUNTANT,
  ctx,
  DEBTOR_IBAN,
  declare,
  ENTITIES,
  entity,
  ourCompany,
  RIB,
  staff,
  TESTS,
  useCollectionTestScene,
} from "./collection-test-scene.js";

useCollectionTestScene();

const fileOf = (companyId: string): string => `${TESTS}/debtors/${companyId}/bank-account.csv`;

describe("le RIB de l'établissement pour la banque", () => {
  it("rend la seule ligne de son compte, au rendu de l'export des RIB, sans rien marquer exporté", async () => {
    const entityId = await entity();
    const { companyId, mandateId } = await ourCompany(entityId);
    const other = await ourCompany(entityId);
    await declare(companyId);
    await declare(other.companyId);
    const { reference } = await ctx.prisma.paymentMandate.findUniqueOrThrow({
      where: { id: mandateId },
    });

    const file = await staff().get(fileOf(companyId)).buffer(true).expect(200);

    expect(file.headers["cache-control"]).toBe("no-store");
    expect(file.headers["content-type"]).toContain("text/csv");
    expect(file.headers["content-disposition"]).toContain(
      `ESSAI-rib-banque-552100554-${reference}.csv`,
    );
    const text = file.text;
    expect(text.split("\r\n")).toEqual([expect.any(String), ""]);
    expect(text).toContain(DEBTOR_IBAN.slice(4));
    expect(text).toContain(`;${RIB.holder};`);
    const card = jsonBody<AccountBankExportsView>(
      await staff().get(`${ENTITIES}/${entityId}/account-exports`).expect(200),
    );
    expect(card.toExport.length).toBeGreaterThan(0);
    expect(await ctx.prisma.accountBankExport.count()).toBe(0);
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: companyId, type: "collection.test_bank_account_exported" },
    });
    expect(facts).toHaveLength(1);
    expect(JSON.stringify(facts[0]?.payload)).not.toContain(DEBTOR_IBAN.slice(4));
  });

  it("refuse une société non déclarée (409), sans rien journaliser", async () => {
    const entityId = await entity();
    const { companyId } = await ourCompany(entityId);

    await staff().get(fileOf(companyId)).expect(409);

    expect(
      await ctx.prisma.activityEvent.count({
        where: { type: "collection.test_bank_account_exported" },
      }),
    ).toBe(0);
  });

  it("refuse (403) à qui n'a que la comptabilité", async () => {
    await ctx.prisma.staffUser.create({
      data: {
        id: ACCOUNTANT.id,
        firstName: "Fiche",
        lastName: "Comptable",
        email: "comptable@lfc.test",
        role: "comptabilite",
        status: "active",
        auth0Id: ACCOUNTANT.sub,
      },
    });
    await ctx.asSub(ACCOUNTANT.sub).get(fileOf("c")).expect(403);
  });
});
