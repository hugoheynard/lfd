/**
 * **Les gardes SQL de `card_payment.payment`** (plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * lot P0, §3.4, §4.3, garantie G1 du §11).
 *
 * Ce que seul le vrai Postgres prouve : les CHECK, l'index unique partiel et
 * les déclencheurs que Prisma ne sait pas écrire, posés à la main dans
 * `20261109030000_le_schema_de_l_encaissement_par_carte`. Les lignes sont
 * écrites en SQL brut : le bloc `src/card-payment/` n'existe pas encore (lot
 * P0.b), et c'est la base elle-même qu'on éprouve — un agrégat qui refuserait
 * avant elle cacherait ce qu'elle laisse passer.
 */
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

type State = "pending" | "paid" | "failed" | "closed";

interface PaymentRow {
  readonly id: string;
  readonly subjectId: string;
  readonly account: string;
  readonly providerRef: string | null;
  readonly role: "first" | "complement";
  readonly amountCents: number;
  readonly state: State;
}

/** La machine du §3.4 — les seules paires admises, hors `(x, x)`. */
const ALLOWED: readonly (readonly [State, State])[] = [
  ["pending", "paid"],
  ["pending", "failed"],
  ["failed", "paid"],
  ["pending", "closed"],
  ["failed", "closed"],
  ["closed", "paid"],
];
const STATES: readonly State[] = ["pending", "paid", "failed", "closed"];

let ctx: E2eContext;
let sequence = 0;

function row(overrides: Partial<PaymentRow> = {}): PaymentRow {
  sequence += 1;
  return {
    id: `pay_${String(sequence)}`,
    subjectId: `ord_${String(sequence)}`,
    account: "lfc-stripe",
    providerRef: `pi_${String(sequence)}`,
    role: "first",
    amountCents: 1250,
    state: "pending",
    ...overrides,
  };
}

function insert(payment: PaymentRow): Promise<number> {
  return ctx.prisma.$executeRaw`
    INSERT INTO "card_payment"."payment"
      ("id", "subject_type", "subject_id", "account", "provider_ref", "role",
       "amount_cents", "state", "created_at")
    VALUES (${payment.id}, 'order', ${payment.subjectId}, ${payment.account},
            ${payment.providerRef}, ${payment.role}::"card_payment"."CardPaymentRole",
            ${payment.amountCents}, ${payment.state}::"card_payment"."CardPaymentState", now())`;
}

function moveTo(id: string, state: State): Promise<number> {
  return ctx.prisma.$executeRaw`
    UPDATE "card_payment"."payment"
       SET "state" = ${state}::"card_payment"."CardPaymentState"
     WHERE "id" = ${id}`;
}

function remove(id: string): Promise<number> {
  return ctx.prisma.$executeRaw`DELETE FROM "card_payment"."payment" WHERE "id" = ${id}`;
}

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

describe("card_payment.payment — ce que la base refuse d'elle-même (G1)", () => {
  it("refuse un compte hors du registre", async () => {
    await expect(insert(row({ account: "lfc-caisse-epargne" }))).rejects.toThrow(
      /payment_account_known/,
    );
  });

  it("refuse un montant nul ou négatif", async () => {
    await expect(insert(row({ amountCents: 0 }))).rejects.toThrow(/payment_amount_positive/);
    await expect(insert(row({ amountCents: -1 }))).rejects.toThrow(/payment_amount_positive/);
  });

  it("une référence prestataire est unique par compte ; sans référence, aucun conflit", async () => {
    await insert(row({ providerRef: "pi_same" }));
    await expect(insert(row({ providerRef: "pi_same" }))).rejects.toThrow(
      /payment_account_provider_ref_key|Unique constraint/,
    );
    await insert(row({ providerRef: null }));
    await insert(row({ providerRef: null }));
  });

  it("un seul premier paiement par sujet, autant de compléments qu'il faut", async () => {
    await insert(row({ subjectId: "ord_shared" }));
    await expect(insert(row({ subjectId: "ord_shared" }))).rejects.toThrow(
      /payment_first_per_subject_key|Unique constraint/,
    );
    await insert(row({ subjectId: "ord_shared", role: "complement" }));
    await insert(row({ subjectId: "ord_shared", role: "complement" }));
  });
});

describe("card_payment.payment — la machine des états (§3.4)", () => {
  it("chaque paire (état, état) est admise ou refusée selon la machine, (x, x) compris", async () => {
    const observed: string[] = [];
    const expected: string[] = [];
    for (const from of STATES) {
      for (const to of STATES) {
        const payment = row({ state: from });
        await insert(payment);
        const admitted =
          from === to || ALLOWED.some(([before, after]) => before === from && after === to);
        const outcome = await moveTo(payment.id, to).then(
          () => "admise",
          (error: unknown) => (String(error).includes("n'existe pas") ? "refusée" : String(error)),
        );
        observed.push(`${from} → ${to} : ${outcome}`);
        expected.push(`${from} → ${to} : ${admitted ? "admise" : "refusée"}`);
      }
    }
    expect(observed).toEqual(expected);
    expect(observed).toHaveLength(STATES.length * STATES.length);
  });

  it("refuse paid → pending, en nommant la transition", async () => {
    const payment = row({ state: "paid" });
    await insert(payment);
    await expect(moveTo(payment.id, "pending")).rejects.toThrow(/paid → pending n'existe pas/);
  });
});

describe("card_payment.payment — les colonnes immuables", () => {
  it("refuse de changer le montant, le compte, le rôle ou le sujet", async () => {
    const payment = row();
    await insert(payment);
    await expect(
      ctx.prisma.$executeRaw`
        UPDATE "card_payment"."payment" SET "amount_cents" = 999 WHERE "id" = ${payment.id}`,
    ).rejects.toThrow(/le montant d'un paiement ne change pas/);
    await expect(
      ctx.prisma.$executeRaw`
        UPDATE "card_payment"."payment" SET "role" = 'complement' WHERE "id" = ${payment.id}`,
    ).rejects.toThrow(/le rôle d'un paiement ne change pas/);
    await expect(
      ctx.prisma.$executeRaw`
        UPDATE "card_payment"."payment" SET "subject_id" = 'ord_other' WHERE "id" = ${payment.id}`,
    ).rejects.toThrow(/le sujet d'un paiement ne change pas/);
  });

  it("la référence prestataire se pose une fois, puis ne change plus — ni vers NULL", async () => {
    const payment = row({ providerRef: null });
    await insert(payment);
    await ctx.prisma.$executeRaw`
      UPDATE "card_payment"."payment" SET "provider_ref" = 'pi_set' WHERE "id" = ${payment.id}`;
    await expect(
      ctx.prisma.$executeRaw`
        UPDATE "card_payment"."payment" SET "provider_ref" = 'pi_other' WHERE "id" = ${payment.id}`,
    ).rejects.toThrow(/la référence chez le prestataire est posée/);
    await expect(
      ctx.prisma.$executeRaw`
        UPDATE "card_payment"."payment" SET "provider_ref" = NULL WHERE "id" = ${payment.id}`,
    ).rejects.toThrow(/la référence chez le prestataire est posée/);
  });
});

describe("card_payment.payment — pas de DELETE, sauf la purge", () => {
  it("refuse un DELETE nu, l'admet sous SET LOCAL card_payment.purge dans une transaction, et le réglage meurt avec elle", async () => {
    const kept = row();
    const purged = row();
    await insert(kept);
    await insert(purged);

    await expect(remove(purged.id)).rejects.toThrow(/ne s'efface pas/);

    await ctx.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL card_payment.purge = 'on'`;
      await tx.$executeRaw`DELETE FROM "card_payment"."payment" WHERE "id" = ${purged.id}`;
    });

    expect(
      await ctx.prisma.cardPayment.count({ where: { id: { in: [kept.id, purged.id] } } }),
    ).toBe(1);
    await expect(remove(kept.id)).rejects.toThrow(/ne s'efface pas/);
  });
});
