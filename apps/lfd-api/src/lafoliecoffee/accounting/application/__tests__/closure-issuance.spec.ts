import { SELLER_FACTS } from "../../domain/entities/__tests__/invoice-fixtures.js";
import { LegalEntityNotFoundError } from "../../domain/errors/accounting-errors.js";
import { NotTheInvoicingEntityError } from "../../domain/errors/monthly-invoice-errors.js";
import type { BillingCycle } from "../../domain/services/billing-cycle.js";
import { CREDITOR, ENTITY_ID } from "../../domain/services/__tests__/collection-fixtures.js";
import { closureIssuance, readIssuingParties, type ClosureFrame } from "../closure-issuance.js";
import {
  meansRow,
  PayerMeansStore,
  StorePayersMeansReader,
} from "../commands/__tests__/collection-means-doubles.js";
import {
  FakeMandates,
  FixedBuyers,
  FixedCreditors,
} from "../commands/__tests__/collection-doubles.js";
import {
  FakeMonthlyReader,
  FixedCommitmentRequirements,
  FixedIssuers,
  MemoryInvoices,
  MemoryOutcomes,
} from "../commands/__tests__/monthly-invoice-doubles.js";

/**
 * **L'`Issuance` partagée** (plan `plan-clients-publics-chorus.md`, § 6
 * sexies, v5 S2) : la clôture et « Engagement reçu » la construisent par la
 * même fonction. Les dates sont le SUJET et ne sont comparées qu'entre
 * elles : `at` est une donnée, jamais le mur.
 */

const PAYER = "c_army";
/** La période du 1er au 31 octobre 2026, heure de Paris. */
const PERIOD: BillingCycle = {
  startsAt: new Date("2026-09-30T22:00:00.000Z"),
  closesAt: new Date("2026-10-31T23:00:00.000Z"),
};
/** Le dernier jour de la période. */
const LAST_DAY = "2026-10-31";

/** Le prochain lot : il ne sert qu'à l'échéance d'un prélèvement. */
const CLOSURES = { closureAfter: (): Date => new Date("2026-11-30T23:00:00.000Z") };

function readers(means = new PayerMeansStore()) {
  const reader = new FakeMonthlyReader(new MemoryInvoices(), new MemoryOutcomes());
  return {
    reader,
    buyers: new FixedBuyers(),
    mandates: new FakeMandates(),
    means: new StorePayersMeansReader(means),
    requirements: new FixedCommitmentRequirements(),
  };
}

function frame(at: Date, payerPeriodOf: (payerId: string) => BillingCycle = () => PERIOD) {
  const closure: ClosureFrame = {
    legalEntityId: ENTITY_ID,
    period: PERIOD,
    periodLabel: "octobre 2026",
    closures: CLOSURES,
    payerPeriodOf,
    at,
  };
  return closure;
}

const PARTIES = { creditor: CREDITOR, sellerFacts: SELLER_FACTS };

describe("readIssuingParties — l'entité qui facture", () => {
  it("rend le créancier et le vendeur de la seule entité en service", async () => {
    const parties = await readIssuingParties(
      { creditors: new FixedCreditors(CREDITOR), issuers: new FixedIssuers([SELLER_FACTS]) },
      ENTITY_ID,
    );

    expect(parties).toEqual(PARTIES);
  });

  it("refuse une entité inconnue", async () => {
    await expect(
      readIssuingParties(
        { creditors: new FixedCreditors(null), issuers: new FixedIssuers([SELLER_FACTS]) },
        ENTITY_ID,
      ),
    ).rejects.toThrow(LegalEntityNotFoundError);
  });

  it("refuse quand une autre entité facture aussi", async () => {
    const other = { ...SELLER_FACTS, legalEntityId: "le_2" };

    await expect(
      readIssuingParties(
        {
          creditors: new FixedCreditors(CREDITOR),
          issuers: new FixedIssuers([SELLER_FACTS, other]),
        },
        ENTITY_ID,
      ),
    ).rejects.toThrow(NotTheInvoicingEntityError);
  });
});

describe("closureIssuance — ce qu'une facture de période fige", () => {
  it("émise la veille de la clôture, elle porte le dernier jour de la période", async () => {
    const issuance = await closureIssuance(
      readers(),
      PARTIES,
      frame(new Date("2026-10-31T21:56:00.000Z")),
      [],
      [],
    );

    expect(issuance.issuedOn).toBe(LAST_DAY);
    expect(issuance.transferDueOn > LAST_DAY).toBe(true);
  });

  it("émise plus tard (un engagement reçu), elle porte le jour réel, jamais une antidate", async () => {
    const issuance = await closureIssuance(
      readers(),
      PARTIES,
      frame(new Date("2026-11-20T09:00:00.000Z")),
      [],
      [],
    );

    expect(issuance.issuedOn).toBe("2026-11-20");
    expect(issuance.collectionDueOn >= "2026-11-20").toBe(true);
    expect(issuance.period).toEqual(PERIOD);
  });

  it("lit le moyen du payeur au début de SA période, celle que le cadre donne", async () => {
    const means = new PayerMeansStore();
    means.rows.push(
      meansRow(PAYER, "bank_transfer", new Date("2026-10-15T00:00:00.000Z"), ENTITY_ID),
    );
    const before = await closureIssuance(
      readers(means),
      PARTIES,
      frame(new Date("2026-11-20T09:00:00.000Z")),
      [{ payerId: PAYER, orders: [] }],
      [],
    );
    const after = await closureIssuance(
      readers(means),
      PARTIES,
      frame(new Date("2026-11-20T09:00:00.000Z"), () => ({
        startsAt: new Date("2026-10-20T00:00:00.000Z"),
        closesAt: PERIOD.closesAt,
      })),
      [{ payerId: PAYER, orders: [] }],
      [],
    );

    expect(before.context.collectionMeansOf(PAYER)).not.toBe("bank_transfer");
    expect(after.context.collectionMeansOf(PAYER)).toBe("bank_transfer");
    expect(after.payerPeriodOf(PAYER).startsAt).toEqual(new Date("2026-10-20T00:00:00.000Z"));
  });
});
