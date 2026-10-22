import {
  CollectionTestAmountOutOfRangeError,
  CollectionTestCompanyNotFoundError,
  CollectionTestCreditorNotFoundError,
  CollectionTestOneOffUsedError,
  CollectionTestSequenceMismatchError,
  NotOwnEstablishmentError,
  OwnEstablishmentAlreadyDeclaredError,
  OwnEstablishmentNotDeclaredError,
} from "../../../domain/errors/collection-test-errors.js";
import {
  DUE_DAY,
  EARLIEST_DAY,
  OUR_COMPANY,
} from "../../../domain/entities/__tests__/collection-test-fixtures.js";
import { mandate } from "../../../domain/services/__tests__/collection-fixtures.js";
import { DeclareOwnEstablishmentCommand } from "../declare-own-establishment.command.js";
import { GenerateCollectionTestCommand } from "../generate-collection-test.command.js";
import { MarkCollectionTestRefundedCommand } from "../mark-collection-test-refunded.command.js";
import { WithdrawOwnEstablishmentCommand } from "../withdraw-own-establishment.command.js";
import { collectionTestWorld } from "./collection-test-world.js";

/** Après l'échéance du 5 novembre 2026 — l'horloge des gestes qui suivent. */
const AFTER_DUE = new Date("2026-11-06T09:00:00.000Z");
const DEBTOR_IBAN = "FR7630004000031234567890143";

function generate(
  overrides: Partial<{ amountCents: number; sequence: "RCUR" | "FRST" | "OOFF" }> = {},
) {
  return new GenerateCollectionTestCommand(
    OUR_COMPANY,
    overrides.amountCents ?? 100,
    DUE_DAY,
    overrides.sequence ?? "RCUR",
    null,
    "staff_1",
  );
}

async function declared() {
  const w = collectionTestWorld();
  await w.declare.execute(new DeclareOwnEstablishmentCommand(OUR_COMPANY, "staff_1"));
  return w;
}

describe("nos établissements", () => {
  it("déclare une société : la ligne, son auteur, et le fait au journal", async () => {
    const w = await declared();

    expect(w.establishments.saved.get(OUR_COMPANY)?.toPersistence()).toMatchObject({
      declared: { staffId: "staff_1" },
      withdrawn: null,
    });
    expect(w.events.traced.map((event) => event.journalFact().type)).toEqual([
      "collection.own_establishment_declared",
    ]);
  });

  it("refuse une seconde déclaration, et une société inconnue", async () => {
    const w = await declared();

    await expect(
      w.declare.execute(new DeclareOwnEstablishmentCommand(OUR_COMPANY, "s")),
    ).rejects.toThrow(OwnEstablishmentAlreadyDeclaredError);
    await expect(
      w.declare.execute(new DeclareOwnEstablishmentCommand("c_inconnue", "s")),
    ).rejects.toThrow(CollectionTestCompanyNotFoundError);
  });

  it("retire, garde la ligne, puis redéclare", async () => {
    const w = await declared();

    await w.withdraw.execute(new WithdrawOwnEstablishmentCommand(OUR_COMPANY, "staff_2"));
    expect(w.establishments.saved.get(OUR_COMPANY)?.isDeclared).toBe(false);
    await expect(
      w.withdraw.execute(new WithdrawOwnEstablishmentCommand(OUR_COMPANY, "s")),
    ).rejects.toThrow(OwnEstablishmentNotDeclaredError);

    await w.declare.execute(new DeclareOwnEstablishmentCommand(OUR_COMPANY, "staff_3"));
    expect(w.establishments.saved.get(OUR_COMPANY)?.toPersistence().declared.staffId).toBe(
      "staff_3",
    );
  });

  it("la page nomme qui a déclaré", async () => {
    const w = await declared();

    const view = await w.listEstablishments.execute();

    expect(view.establishments).toEqual([
      expect.objectContaining({ companyId: OUR_COMPANY, declaredByName: "Camille Compta" }),
    ]);
  });
});

describe("générer un prélèvement d'essai", () => {
  it("une société non déclarée est refusée, et rien n'est gardé", async () => {
    const w = collectionTestWorld();

    await expect(w.generate.execute(generate())).rejects.toThrow(NotOwnEstablishmentError);
    expect(w.tests.saveCount).toBe(0);
    expect(w.events.traced).toHaveLength(0);
  });

  it("1,01 € est refusé (plafond 1 €)", async () => {
    const w = await declared();

    await expect(w.generate.execute(generate({ amountCents: 101 }))).rejects.toThrow(
      CollectionTestAmountOutOfRangeError,
    );
    expect(w.tests.saveCount).toBe(0);
  });

  it("garde l'essai, et le journal ne porte ni IBAN ni RUM", async () => {
    const w = await declared();

    const id = await w.generate.execute(generate({ sequence: "FRST" }));

    expect(w.tests.saved.get(id)?.toPersistence()).toMatchObject({
      debtorCompanyId: OUR_COMPANY,
      sequence: "FRST",
      amountCents: 100,
      messageId: `ESS-${id}`,
    });
    const fact = w.events.traced.at(-1)?.journalFact();
    expect(fact).toMatchObject({
      type: "collection.test_generated",
      subjectType: "company",
      subjectId: OUR_COMPANY,
      payload: { sequence: "FRST", amountCents: 100, legalEntity: { id: "le_1" } },
    });
    expect(JSON.stringify(fact)).not.toContain(DEBTOR_IBAN);
    expect(JSON.stringify(fact)).not.toContain(`RUM-${OUR_COMPANY}`);
  });

  it("OOFF sur un mandat récurrent est refusé", async () => {
    const w = await declared();

    await expect(w.generate.execute(generate({ sequence: "OOFF" }))).rejects.toThrow(
      CollectionTestSequenceMismatchError,
    );
  });

  it("OOFF sur un mandat ponctuel qu'un lot réel porte est refusé", async () => {
    const w = await declared();
    const oneOff = mandate(OUR_COMPANY, { paymentType: "one_off" });
    w.mandates.mandates = [oneOff];
    w.batched.ids.add(oneOff.mandateId);

    await expect(w.generate.execute(generate({ sequence: "OOFF" }))).rejects.toThrow(
      CollectionTestOneOffUsedError,
    );
  });

  it("un créancier introuvable est refusé en nommant le mandat", async () => {
    const w = collectionTestWorld(null);
    await w.declare.execute(new DeclareOwnEstablishmentCommand(OUR_COMPANY, "staff_1"));

    await expect(w.generate.execute(generate())).rejects.toThrow(
      CollectionTestCreditorNotFoundError,
    );
  });

  it("une société retirée n'est plus essayable", async () => {
    const w = await declared();
    await w.withdraw.execute(new WithdrawOwnEstablishmentCommand(OUR_COMPANY, "s"));

    await expect(w.generate.execute(generate())).rejects.toThrow(NotOwnEstablishmentError);
  });
});

describe("l'outil d'essai et la liste « Essais »", () => {
  it("propose l'échéance du calendrier, les séquences, le mandat masqué", async () => {
    const w = await declared();

    const view = await w.debtors.execute();

    expect(view.maxAmountCents).toBe(100);
    expect(view.defaultRemittance).toBe("ESSAI PRELEVEMENT");
    expect(view.debtors).toEqual([
      {
        companyId: OUR_COMPANY,
        companyName: "Folie Douce Val",
        mandate: {
          reference: `RUM-${OUR_COMPANY}`,
          scheme: "B2B",
          paymentType: "recurrent",
          ibanLast4: "0143",
        },
        sequences: ["RCUR", "FRST"],
        earliestCollectionDay: EARLIEST_DAY,
        refusal: null,
      },
    ]);
  });

  it("dit en mots pourquoi un établissement n'est pas essayable", async () => {
    const w = await declared();
    w.companies.companies.set(OUR_COMPANY, { name: "Folie Douce Val", status: "suspended" });

    const [debtor] = (await w.debtors.execute()).debtors;

    expect(debtor).toMatchObject({ sequences: [], earliestCollectionDay: null });
    expect(debtor?.refusal).toContain("suspended");
  });

  it("un essai échu est « à rembourser », puis « remboursé » par le geste", async () => {
    const w = await declared();
    const id = await w.generate.execute(generate());

    expect((await w.listTests(AFTER_DUE).execute()).tests[0]).toMatchObject({
      status: "to_refund",
      createdByName: "Camille Compta",
    });
    await w
      .refund(AFTER_DUE)
      .execute(new MarkCollectionTestRefundedCommand(id, "2026-11-06", "staff_1"));

    expect((await w.listTests(AFTER_DUE).execute()).tests[0]).toMatchObject({
      status: "refunded",
      refundedOn: "2026-11-06",
      refundedByName: "Camille Compta",
    });
    expect(w.events.traced.at(-1)?.journalFact().type).toBe("collection.test_refunded");
  });
});
