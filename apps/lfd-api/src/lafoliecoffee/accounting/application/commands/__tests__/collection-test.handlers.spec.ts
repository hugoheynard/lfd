import { randomUUID } from "node:crypto";
import {
  CollectionTestAmountOutOfRangeError,
  CollectionTestCompanyNotFoundError,
  CollectionTestCreditorNotFoundError,
  CollectionTestLookalikeError,
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
import {
  GenerateCollectionTestCommand,
  type CollectionTestDebtorRequest,
} from "../generate-collection-test.command.js";
import { MarkCollectionTestRefundedCommand } from "../mark-collection-test-refunded.command.js";
import { WithdrawOwnEstablishmentCommand } from "../withdraw-own-establishment.command.js";
import { collectionTestWorld } from "./collection-test-world.js";

/** Après l'échéance du 5 novembre 2026 — l'horloge des gestes qui suivent. */
const AFTER_DUE = new Date("2026-11-06T09:00:00.000Z");
const DEBTOR_IBAN = "FR7630004000031234567890143";

function generate(
  overrides: Partial<{ amountCents: number; sequence: "RCUR" | "FRST" | "OOFF" }> = {},
) {
  return generateFor([
    {
      companyId: OUR_COMPANY,
      amountCents: overrides.amountCents ?? 100,
      sequence: overrides.sequence ?? "RCUR",
    },
  ]);
}

function generateFor(debtors: readonly CollectionTestDebtorRequest[], intentKey = randomUUID()) {
  return new GenerateCollectionTestCommand(debtors, DUE_DAY, null, "staff_1", intentKey);
}

/** La ligne unique d'un envoi gardé. */
function onlyTestOf(w: ReturnType<typeof collectionTestWorld>, fileId: string) {
  const [test] = w.files.saved.get(fileId)?.tests ?? [];
  return test;
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
    expect(w.files.saved.size).toBe(0);
    expect(w.events.traced).toHaveLength(0);
  });

  it("1,01 € est refusé (plafond 1 €)", async () => {
    const w = await declared();

    await expect(w.generate.execute(generate({ amountCents: 101 }))).rejects.toThrow(
      CollectionTestAmountOutOfRangeError,
    );
    expect(w.files.saved.size).toBe(0);
  });

  it("garde l'essai, et le journal ne porte ni IBAN ni RUM", async () => {
    const w = await declared();

    const fileId = await w.generate.execute(generate({ sequence: "FRST" }));
    const test = onlyTestOf(w, fileId);

    expect(test?.toPersistence()).toMatchObject({
      fileId,
      debtorCompanyId: OUR_COMPANY,
      sequence: "FRST",
      amountCents: 100,
      messageId: `ESS-${fileId}`,
    });
    expect(test?.id).not.toBe(fileId);
    const fact = w.events.traced.at(-1)?.journalFact();
    expect(fact).toMatchObject({
      type: "collection.test_generated",
      subjectType: "company",
      subjectId: OUR_COMPANY,
      payload: {
        sequence: "FRST",
        amountCents: 100,
        legalEntity: { id: "le_1" },
        fileId,
        messageId: `ESS-${fileId}`,
        endToEndId: `ESS-${test?.id ?? ""}`,
      },
    });
    expect(JSON.stringify(fact)).not.toContain(DEBTOR_IBAN);
    expect(JSON.stringify(fact)).not.toContain(`RUM-${OUR_COMPANY.replaceAll("_", "-")}`);
  });

  it("le même montant sur le même mandat est refusé, un autre montant passe", async () => {
    const w = await declared();
    await w.generate.execute(generate());

    await expect(w.generate.execute(generate())).rejects.toThrow(CollectionTestLookalikeError);
    expect(w.files.saved.size).toBe(1);
    await expect(w.generate.execute(generate({ amountCents: 99 }))).resolves.toBeDefined();
    expect(w.files.saved.size).toBe(2);
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
          reference: `RUM-${OUR_COMPANY.replaceAll("_", "-")}`,
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
    const fileId = await w.generate.execute(generate());
    const id = onlyTestOf(w, fileId)?.id ?? "";

    expect((await w.listTests(AFTER_DUE).execute()).tests[0]).toMatchObject({
      fileId,
      messageId: `ESS-${fileId}`,
      endToEndId: `ESS-${id}`,
      status: "to_refund",
      createdByName: "Camille Compta",
    });
    await w
      .refund(AFTER_DUE)
      .execute(new MarkCollectionTestRefundedCommand(id, "2026-11-06", "staff_1"));
    expect(w.events.traced.at(-1)?.journalFact().payload).toMatchObject({
      messageId: `ESS-${fileId}`,
      endToEndId: `ESS-${id}`,
    });

    expect((await w.listTests(AFTER_DUE).execute()).tests[0]).toMatchObject({
      status: "refunded",
      refundedOn: "2026-11-06",
      refundedByName: "Camille Compta",
    });
    expect(w.events.traced.at(-1)?.journalFact().type).toBe("collection.test_refunded");
  });
});

describe("générer un prélèvement d'essai — une fois par intention", () => {
  /**
   * Régression : un double clic lisait un refus (« essai semblable ») après un
   * succès, et deux envois simultanés gardaient deux fichiers.
   */
  it("la même clé rend le même essai, sans en garder un second", async () => {
    const w = await declared();
    const command = generate();

    const first = await w.generate.execute(command);
    const replay = await w.generate.execute(command);

    expect(replay).toBe(first);
    expect(w.files.saved.size).toBe(1);
  });

  it("l'ordre des débiteurs ne change pas l'intention", async () => {
    const w = await declaredTwo();
    const key = randomUUID();

    const first = await w.generate.execute(generateFor([OURS, THEIRS], key));
    const replay = await w.generate.execute(generateFor([THEIRS, OURS], key));

    expect(replay).toBe(first);
    expect(w.files.saved.size).toBe(1);
  });
});

const OTHER_COMPANY = "c_autre";
const OURS: CollectionTestDebtorRequest = {
  companyId: OUR_COMPANY,
  amountCents: 100,
  sequence: "RCUR",
};
const THEIRS: CollectionTestDebtorRequest = {
  companyId: OTHER_COMPANY,
  amountCents: 42,
  sequence: "FRST",
};

/** Deux de nos établissements déclarés, chacun son mandat chez `le_1`. */
async function declaredTwo() {
  const w = await declared();
  w.companies.companies.set(OTHER_COMPANY, { name: "Folie Douce Mer", status: "active" });
  w.mandates.mandates = [mandate(OUR_COMPANY), mandate(OTHER_COMPANY)];
  await w.declare.execute(new DeclareOwnEstablishmentCommand(OTHER_COMPANY, "staff_1"));
  return w;
}

describe("générer un envoi à deux débiteurs", () => {
  it("garde un envoi, deux essais, et un fait par essai", async () => {
    const w = await declaredTwo();

    const fileId = await w.generate.execute(generateFor([OURS, THEIRS]));

    const tests = w.files.saved.get(fileId)?.tests.map((test) => test.toPersistence()) ?? [];
    expect(tests).toEqual([
      expect.objectContaining({ fileId, debtorCompanyId: OUR_COMPANY, amountCents: 100 }),
      expect.objectContaining({ fileId, debtorCompanyId: OTHER_COMPANY, amountCents: 42 }),
    ]);
    expect(w.tests.saved.size).toBe(2);
    const facts = w.events.traced
      .map((event) => event.journalFact())
      .filter((fact) => fact.type === "collection.test_generated");
    expect(facts.map((fact) => fact.subjectId)).toEqual([OUR_COMPANY, OTHER_COMPANY]);
    expect(facts.map((fact) => fact.payload["messageId"])).toEqual([
      `ESS-${fileId}`,
      `ESS-${fileId}`,
    ]);
  });

  it("un refus sur une seule ligne n'écrit rien", async () => {
    const w = await declaredTwo();
    const before = w.events.traced.length;

    await expect(
      w.generate.execute(generateFor([OURS, { ...THEIRS, amountCents: 101 }])),
    ).rejects.toThrow(CollectionTestAmountOutOfRangeError);
    expect(w.files.saved.size).toBe(0);
    expect(w.tests.saved.size).toBe(0);
    expect(w.events.traced).toHaveLength(before);
  });

  it("une ligne sur un établissement non déclaré refuse l'envoi entier", async () => {
    const w = await declared();
    w.companies.companies.set(OTHER_COMPANY, { name: "Folie Douce Mer", status: "active" });

    await expect(w.generate.execute(generateFor([OURS, THEIRS]))).rejects.toThrow(
      NotOwnEstablishmentError,
    );
    expect(w.files.saved.size).toBe(0);
  });
});
