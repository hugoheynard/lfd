/**
 * E2E de l'outil de prélèvement d'essai — **la déclaration** : le droit, nos établissements
 * et le mandat de l'établissement pour la banque.
 *
 * Découpé de `collection-tests.e2e-spec.ts` le 2026-10-23 ; la scène
 * commune vit dans `collection-test-scene.ts`.
 */
import type { OwnEstablishmentsView } from "@lfd/contracts";
import { signatureDateCell } from "../src/b2b/accounting/domain/services/mandate-bank-export-values.js";
import { E2E_STAFF_ID, jsonBody } from "./e2e-harness.js";
import {
  ACCOUNTANT,
  ctx,
  DEBTOR_IBAN,
  declare,
  entity,
  ESTABLISHMENTS,
  ourCompany,
  SIGNED_AT,
  staff,
  TESTS,
  useCollectionTestScene,
} from "./collection-test-scene.js";

useCollectionTestScene();

describe("le droit `collection_test`", () => {
  it("refuse (403) la page et l'outil à qui n'a que la comptabilité", async () => {
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
    const accountant = () => ctx.asSub(ACCOUNTANT.sub);

    await accountant().get(ESTABLISHMENTS).expect(403);
    await accountant().post(ESTABLISHMENTS).send({ companyId: "c" }).expect(403);
    await accountant().get(`${TESTS}/debtors`).expect(403);
    await accountant().post(TESTS).send({}).expect(403);
    await accountant().get(`${TESTS}/debtors/c/mandate.csv`).expect(403);
  });
});

describe("nos établissements", () => {
  it("déclare, relit avec l'auteur, retire — la ligne reste, le journal le dit", async () => {
    const entityId = await entity();
    const { companyId } = await ourCompany(entityId);

    await declare(companyId);
    const view = jsonBody<OwnEstablishmentsView>(await staff().get(ESTABLISHMENTS).expect(200));
    expect(view.establishments).toEqual([
      expect.objectContaining({
        companyId,
        companyName: "Folie Douce Val",
        declaredByName: "Opérateur E2E",
      }),
    ]);
    await staff().post(ESTABLISHMENTS).send({ companyId }).expect(409);

    await staff().post(`${ESTABLISHMENTS}/${companyId}/withdraw`).expect(204);
    expect(
      jsonBody<OwnEstablishmentsView>(await staff().get(ESTABLISHMENTS)).establishments,
    ).toEqual([]);
    expect(
      await ctx.prisma.ownEstablishment.findUniqueOrThrow({ where: { companyId } }),
    ).toMatchObject({
      declaredByStaffId: E2E_STAFF_ID,
      withdrawnByStaffId: E2E_STAFF_ID,
    });
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: companyId, type: { startsWith: "collection." } },
      orderBy: { occurredAt: "asc" },
    });
    expect(facts.map((fact) => fact.type)).toEqual([
      "collection.own_establishment_declared",
      "collection.own_establishment_withdrawn",
    ]);
  });
});

describe("le mandat de l'établissement pour la banque", () => {
  it("rend la seule ligne du mandat choisi, au format d'import, sans figer d'export", async () => {
    const entityId = await entity();
    const { companyId, mandateId } = await ourCompany(entityId);
    const other = await ourCompany(entityId);
    await declare(companyId);
    await declare(other.companyId);
    const { reference } = await ctx.prisma.paymentMandate.findUniqueOrThrow({
      where: { id: mandateId },
    });

    const file = await staff().get(`${TESTS}/debtors/${companyId}/mandate.csv`).expect(200);

    expect(file.headers["cache-control"]).toBe("no-store");
    expect(file.headers["content-type"]).toContain("text/csv");
    expect(file.headers["content-disposition"]).toContain(
      `ESSAI-mandat-banque-552100554-${reference}.csv`,
    );
    const cells = file.text.split(";");
    expect(file.text.split("\r\n")).toEqual([expect.any(String), ""]);
    expect(cells.slice(0, 8)).toEqual([
      reference,
      "FR72ZZZ123456",
      "Folie Douce Val",
      DEBTOR_IBAN,
      expect.stringMatching(/^BNPAFRPP/u),
      signatureDateCell(new Date(SIGNED_AT)),
      "RECURRENT",
      "B2B",
    ]);
    // I et J vides, K « O », L « N », M à R vides (modèle CENET, 18 colonnes).
    expect(file.text.endsWith("B2B;;;O;N;;;;;;;\r\n")).toBe(true);
    expect(await ctx.prisma.mandateBankExport.count()).toBe(0);
  });

  it("refuse une société non déclarée (409)", async () => {
    const entityId = await entity();
    const { companyId } = await ourCompany(entityId);
    await staff().get(`${TESTS}/debtors/${companyId}/mandate.csv`).expect(409);
  });
});
