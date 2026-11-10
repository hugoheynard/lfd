/**
 * **Les gardes SQL du remboursement par carte** (plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * lot P1, §3.4, §5.1, §5.4, garantie G1 du §11).
 *
 * Ce que seul le vrai Postgres prouve : les CHECK, l'index unique partiel, les
 * deux machines à états et leurs colonnes immuables, le refus du DELETE, posés
 * à la main dans `20261110010100_le_remboursement_par_carte`. Les lignes sont
 * écrites en SQL brut : le code du remboursement n'existe pas encore dans
 * `src/card-payment/` (lot P1.b), et c'est la base elle-même qu'on éprouve —
 * un agrégat qui refuserait avant elle cacherait ce qu'elle laisse passer.
 */
import { purgeCardPayments } from "../src/dev/scenario/purge/card-payment.purge.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

type RequestState = "to_issue" | "issued" | "refunded" | "stopped" | "settled_elsewhere";
type RefundStatus = "pending" | "requires_action" | "succeeded" | "failed" | "canceled";

interface RequestRow {
  readonly id: string;
  readonly paymentId: string;
  readonly form: "remainder" | "amount";
  readonly amountCents: number | null;
  readonly state: RequestState;
  readonly settledBy: string | null;
  readonly settledReason: string | null;
}

interface RefundRow {
  readonly id: string;
  readonly paymentId: string;
  readonly account: string;
  readonly requestId: string | null;
  readonly source: "provider" | "manual";
  readonly providerRef: string | null;
  readonly amountCents: number;
  readonly status: RefundStatus;
}

/** La machine `refund_request.state` du §3.4 — les seules paires admises, hors `(x, x)`. */
const REQUEST_ALLOWED: readonly (readonly [RequestState, RequestState])[] = [
  ["to_issue", "issued"],
  ["to_issue", "refunded"],
  ["to_issue", "stopped"],
  ["issued", "refunded"],
  ["issued", "stopped"],
  ["stopped", "to_issue"],
  ["stopped", "refunded"],
  ["stopped", "settled_elsewhere"],
  ["refunded", "stopped"],
];
const REQUEST_STATES: readonly RequestState[] = [
  "to_issue",
  "issued",
  "refunded",
  "stopped",
  "settled_elsewhere",
];

/** Le carnet d'aujourd'hui (`refundTransition`, `order-refund.ts`), hors `(x, x)`. */
const REFUND_ALLOWED: readonly (readonly [RefundStatus, RefundStatus])[] = [
  ["pending", "requires_action"],
  ["pending", "succeeded"],
  ["pending", "failed"],
  ["pending", "canceled"],
  ["requires_action", "pending"],
  ["requires_action", "succeeded"],
  ["requires_action", "failed"],
  ["requires_action", "canceled"],
  ["succeeded", "failed"],
];
const REFUND_STATUSES: readonly RefundStatus[] = [
  "pending",
  "requires_action",
  "succeeded",
  "failed",
  "canceled",
];

let ctx: E2eContext;
let sequence = 0;

function next(prefix: string): string {
  sequence += 1;
  return `${prefix}_${String(sequence)}`;
}

/** Un paiement `first` d'une commande, écrit comme la reprise de P0 l'écrit. */
async function aPayment(subjectId = next("ord")): Promise<string> {
  const id = next("pay");
  await ctx.prisma.$executeRaw`
    INSERT INTO "card_payment"."payment"
      ("id", "subject_type", "subject_id", "account", "provider_ref", "role",
       "amount_cents", "state", "created_at")
    VALUES (${id}, 'order', ${subjectId}, 'lfc-stripe', ${next("pi")}, 'first',
            5000, 'paid', now())`;
  return id;
}

function request(paymentId: string, overrides: Partial<RequestRow> = {}): RequestRow {
  return {
    id: next("req"),
    paymentId,
    form: "remainder",
    amountCents: null,
    state: "to_issue",
    settledBy: null,
    settledReason: null,
    ...overrides,
  };
}

function insertRequest(row: RequestRow): Promise<number> {
  return ctx.prisma.$executeRaw`
    INSERT INTO "card_payment"."refund_request"
      ("id", "payment_id", "form", "amount_cents", "nature", "reason", "state",
       "announced_cents", "requested_at", "next_attempt_at",
       "settled_by_staff_id", "settled_reason")
    VALUES (${row.id}, ${row.paymentId}, ${row.form}::"card_payment"."CardRefundForm",
            ${row.amountCents}, 'return', 'cancellation',
            ${row.state}::"card_payment"."CardRefundRequestState", 5000, now(), now(),
            ${row.settledBy}, ${row.settledReason})`;
}

/** Passe une demande à `to`, en posant ce que la cible exige (`settled_elsewhere`). */
function moveRequestTo(id: string, to: RequestState): Promise<number> {
  const settled = to === "settled_elsewhere";
  return ctx.prisma.$executeRaw`
    UPDATE "card_payment"."refund_request"
       SET "state" = ${to}::"card_payment"."CardRefundRequestState",
           "settled_by_staff_id" = ${settled ? "stf_1" : null},
           "settled_reason" = ${settled ? "rendu en espèces" : null}
     WHERE "id" = ${id}`;
}

function refund(paymentId: string, overrides: Partial<RefundRow> = {}): RefundRow {
  return {
    id: next("rfd"),
    paymentId,
    account: "lfc-stripe",
    requestId: null,
    source: "provider",
    providerRef: next("re"),
    amountCents: 1200,
    status: "pending",
    ...overrides,
  };
}

function insertRefund(row: RefundRow): Promise<number> {
  return ctx.prisma.$executeRaw`
    INSERT INTO "card_payment"."refund"
      ("id", "payment_id", "account", "request_id", "source", "provider_ref",
       "amount_cents", "currency", "status", "refunded_at", "recorded_at", "updated_at")
    VALUES (${row.id}, ${row.paymentId}, ${row.account}, ${row.requestId},
            ${row.source}::"card_payment"."CardRefundSource", ${row.providerRef},
            ${row.amountCents}, 'eur', ${row.status}::"card_payment"."CardRefundStatus",
            now(), now(), now())`;
}

function moveRefundTo(id: string, to: RefundStatus): Promise<number> {
  return ctx.prisma.$executeRaw`
    UPDATE "card_payment"."refund"
       SET "status" = ${to}::"card_payment"."CardRefundStatus"
     WHERE "id" = ${id}`;
}

/** L'issue d'une écriture, telle que le tableau des paires la compare. */
function verdict(write: Promise<number>): Promise<string> {
  return write.then(
    () => "admise",
    (error: unknown) => (String(error).includes("n'existe pas") ? "refusée" : String(error)),
  );
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

describe("card_payment.refund_request — ce que la base refuse d'elle-même (G1)", () => {
  it("form = amount ⇔ un montant, et un montant est positif", async () => {
    const paymentId = await aPayment();
    await expect(insertRequest(request(paymentId, { form: "amount" }))).rejects.toThrow(
      /refund_request_amount_matches_form/,
    );
    await expect(insertRequest(request(paymentId, { amountCents: 500 }))).rejects.toThrow(
      /refund_request_amount_matches_form/,
    );
    await expect(
      insertRequest(request(paymentId, { form: "amount", amountCents: 0 })),
    ).rejects.toThrow(/refund_request_amount_matches_form/);
    await insertRequest(request(paymentId, { form: "amount", amountCents: 500 }));
  });

  it("une seule remainder EN COURS par paiement ; arrêtées et rendues coexistent", async () => {
    const paymentId = await aPayment();
    await insertRequest(request(paymentId, { state: "stopped" }));
    await insertRequest(request(paymentId, { state: "stopped" }));
    await insertRequest(request(paymentId, { state: "refunded" }));
    await insertRequest(request(paymentId, { state: "to_issue" }));
    await expect(insertRequest(request(paymentId, { state: "issued" }))).rejects.toThrow(
      /refund_request_remainder_in_progress_key|Unique constraint/,
    );
    await insertRequest(request(paymentId, { form: "amount", amountCents: 300 }));
  });

  it("« Relancer » une arrêtée est refusé tant qu'une autre remainder est en cours", async () => {
    const paymentId = await aPayment();
    const stopped = request(paymentId, { state: "stopped" });
    await insertRequest(stopped);
    await insertRequest(request(paymentId, { state: "issued" }));
    await expect(moveRequestTo(stopped.id, "to_issue")).rejects.toThrow(
      /refund_request_remainder_in_progress_key|Unique constraint/,
    );
  });

  it("settled_elsewhere ⇔ motif ET fiche staff", async () => {
    const paymentId = await aPayment();
    await expect(insertRequest(request(paymentId, { state: "settled_elsewhere" }))).rejects.toThrow(
      /refund_request_settled_elsewhere/,
    );
    await expect(
      insertRequest(request(paymentId, { state: "settled_elsewhere", settledBy: "stf_1" })),
    ).rejects.toThrow(/refund_request_settled_elsewhere/);
    await expect(
      insertRequest(
        request(paymentId, { state: "stopped", settledBy: "stf_1", settledReason: "espèces" }),
      ),
    ).rejects.toThrow(/refund_request_settled_elsewhere/);
    await insertRequest(
      request(paymentId, {
        state: "settled_elsewhere",
        settledBy: "stf_1",
        settledReason: "espèces",
      }),
    );
  });

  it("refuse une demande sur un paiement inconnu", async () => {
    await expect(insertRequest(request("pay_inconnu"))).rejects.toThrow(
      /refund_request_payment_id_fkey|Foreign key/,
    );
  });
});

describe("card_payment.refund_request — la machine des états (§3.4)", () => {
  it("chaque paire (état, état) est admise ou refusée selon la machine, (x, x) compris", async () => {
    const observed: string[] = [];
    const expected: string[] = [];
    for (const from of REQUEST_STATES) {
      for (const to of REQUEST_STATES) {
        // Un paiement par paire : l'unicité d'une `remainder` en cours ne s'en mêle pas.
        const settled = from === "settled_elsewhere";
        const row = request(await aPayment(), {
          state: from,
          settledBy: settled ? "stf_1" : null,
          settledReason: settled ? "rendu en espèces" : null,
        });
        await insertRequest(row);
        const admitted =
          from === to || REQUEST_ALLOWED.some(([before, after]) => before === from && after === to);
        observed.push(`${from} → ${to} : ${await verdict(moveRequestTo(row.id, to))}`);
        expected.push(`${from} → ${to} : ${admitted ? "admise" : "refusée"}`);
      }
    }
    expect(observed).toEqual(expected);
    expect(observed).toHaveLength(REQUEST_STATES.length * REQUEST_STATES.length);
  });

  it("refuse refunded → to_issue, en nommant la transition", async () => {
    const row = request(await aPayment(), { state: "refunded" });
    await insertRequest(row);
    await expect(moveRequestTo(row.id, "to_issue")).rejects.toThrow(
      /refunded → to_issue n'existe pas/,
    );
  });
});

describe("card_payment.refund_request — les colonnes immuables", () => {
  it("refuse de changer le paiement, la forme, le montant, la nature ou le motif", async () => {
    const paymentId = await aPayment();
    const other = await aPayment();
    const row = request(paymentId, { form: "amount", amountCents: 700 });
    await insertRequest(row);
    await expect(
      ctx.prisma.$executeRaw`
        UPDATE "card_payment"."refund_request" SET "payment_id" = ${other} WHERE "id" = ${row.id}`,
    ).rejects.toThrow(/le paiement d'une demande ne change pas/);
    await expect(
      ctx.prisma.$executeRaw`
        UPDATE "card_payment"."refund_request" SET "amount_cents" = 800 WHERE "id" = ${row.id}`,
    ).rejects.toThrow(/la forme et le montant d'une demande ne changent pas/);
    await expect(
      ctx.prisma.$executeRaw`
        UPDATE "card_payment"."refund_request"
           SET "form" = 'remainder', "amount_cents" = NULL WHERE "id" = ${row.id}`,
    ).rejects.toThrow(/la forme et le montant d'une demande ne changent pas/);
    await expect(
      ctx.prisma.$executeRaw`
        UPDATE "card_payment"."refund_request" SET "nature" = 'adjustment' WHERE "id" = ${row.id}`,
    ).rejects.toThrow(/la nature et le motif d'une demande ne changent pas/);
    await expect(
      ctx.prisma.$executeRaw`
        UPDATE "card_payment"."refund_request" SET "reason" = 'revision' WHERE "id" = ${row.id}`,
    ).rejects.toThrow(/la nature et le motif d'une demande ne changent pas/);
  });

  it("laisse « Relancer » écrire génération, round, essais et échéance", async () => {
    const row = request(await aPayment(), { state: "stopped" });
    await insertRequest(row);
    await ctx.prisma.$executeRaw`
      UPDATE "card_payment"."refund_request"
         SET "state" = 'to_issue', "generation" = 2, "round" = 1, "attempts" = 0,
             "next_attempt_at" = now()
       WHERE "id" = ${row.id}`;
    expect(
      await ctx.prisma.cardRefundRequest.findUniqueOrThrow({
        where: { id: row.id },
        select: { state: true, generation: true },
      }),
    ).toEqual({ state: "to_issue", generation: 2 });
  });
});

describe("card_payment.refund — ce que la base refuse d'elle-même (G1)", () => {
  it("source = provider ⇔ une référence ; montant positif", async () => {
    const paymentId = await aPayment();
    await expect(insertRefund(refund(paymentId, { providerRef: null }))).rejects.toThrow(
      /refund_source_matches_provider_ref/,
    );
    await expect(insertRefund(refund(paymentId, { source: "manual" }))).rejects.toThrow(
      /refund_source_matches_provider_ref/,
    );
    await expect(insertRefund(refund(paymentId, { amountCents: 0 }))).rejects.toThrow(
      /refund_amount_positive/,
    );
    await insertRefund(
      refund(paymentId, { source: "manual", providerRef: null, status: "succeeded" }),
    );
  });

  it("un re_… est unique par compte ; deux manuels ne se gênent pas", async () => {
    const paymentId = await aPayment();
    await insertRefund(refund(paymentId, { providerRef: "re_same" }));
    await expect(insertRefund(refund(paymentId, { providerRef: "re_same" }))).rejects.toThrow(
      /refund_account_provider_ref_key|Unique constraint/,
    );
    await insertRefund(refund(paymentId, { source: "manual", providerRef: null }));
    await insertRefund(refund(paymentId, { source: "manual", providerRef: null }));
  });

  it("porte le compte de SON paiement, et aucun autre", async () => {
    const paymentId = await aPayment();
    await expect(
      insertRefund(refund(paymentId, { account: "lfc-caisse-epargne" })),
    ).rejects.toThrow(/refund_payment_id_account_fkey|Foreign key/);
  });

  it("refuse une demande inconnue", async () => {
    const paymentId = await aPayment();
    await expect(insertRefund(refund(paymentId, { requestId: "req_inconnue" }))).rejects.toThrow(
      /refund_request_id_fkey|Foreign key/,
    );
  });
});

describe("card_payment.refund — le carnet des statuts (§3.4)", () => {
  it("chaque paire (statut, statut) est admise ou refusée selon le carnet, (x, x) compris", async () => {
    const observed: string[] = [];
    const expected: string[] = [];
    const paymentId = await aPayment();
    for (const from of REFUND_STATUSES) {
      for (const to of REFUND_STATUSES) {
        const row = refund(paymentId, { status: from });
        await insertRefund(row);
        const admitted =
          from === to || REFUND_ALLOWED.some(([before, after]) => before === from && after === to);
        observed.push(`${from} → ${to} : ${await verdict(moveRefundTo(row.id, to))}`);
        expected.push(`${from} → ${to} : ${admitted ? "admise" : "refusée"}`);
      }
    }
    expect(observed).toEqual(expected);
    expect(observed).toHaveLength(REFUND_STATUSES.length * REFUND_STATUSES.length);
  });

  it("refuse succeeded → canceled — illégal ici comme chez le prestataire (§6.2)", async () => {
    const row = refund(await aPayment(), { status: "succeeded" });
    await insertRefund(row);
    await expect(moveRefundTo(row.id, "canceled")).rejects.toThrow(
      /succeeded → canceled n'existe pas/,
    );
  });
});

describe("card_payment.refund — les colonnes immuables", () => {
  it("refuse de changer le paiement, la référence, le montant, la nature ou la source", async () => {
    const paymentId = await aPayment();
    const other = await aPayment();
    const row = refund(paymentId);
    await insertRefund(row);
    await expect(
      ctx.prisma.$executeRaw`
        UPDATE "card_payment"."refund" SET "payment_id" = ${other} WHERE "id" = ${row.id}`,
    ).rejects.toThrow(/le paiement et le compte d'un remboursement ne changent pas/);
    await expect(
      ctx.prisma.$executeRaw`
        UPDATE "card_payment"."refund" SET "provider_ref" = 're_autre' WHERE "id" = ${row.id}`,
    ).rejects.toThrow(/la source et la référence d'un remboursement ne changent pas/);
    await expect(
      ctx.prisma.$executeRaw`
        UPDATE "card_payment"."refund" SET "amount_cents" = 99 WHERE "id" = ${row.id}`,
    ).rejects.toThrow(/le montant d'un remboursement ne change pas/);
    await expect(
      ctx.prisma.$executeRaw`
        UPDATE "card_payment"."refund" SET "nature" = 'return' WHERE "id" = ${row.id}`,
    ).rejects.toThrow(/la nature d'un remboursement ne change pas/);
  });
});

/**
 * L'unicité de `credit_note_id` (un remboursement par avoir) demande un avoir
 * réel : elle est éprouvée par `card-refund-takeover-migration.e2e-spec.ts`,
 * qui en émet un.
 */
describe("public.refund_credit — la raison, et une ligne par remboursement", () => {
  it("une ligne adjustment n'a pas d'avoir, une ligne credit_note en a un", async () => {
    await expect(
      ctx.prisma.$executeRaw`
        INSERT INTO "public"."refund_credit" ("refund_id", "credit_note_id", "reason", "created_at")
        VALUES ('rfd_a', NULL, 'credit_note', now())`,
    ).rejects.toThrow(/refund_credit_reason_matches_credit_note/);
    await ctx.prisma.$executeRaw`
      INSERT INTO "public"."refund_credit" ("refund_id", "credit_note_id", "reason", "created_at")
      VALUES ('rfd_b', NULL, 'adjustment', now()), ('rfd_c', NULL, 'adjustment', now())`;
    expect(await ctx.prisma.refundCredit.count()).toBe(2);
  });

  it("une ligne écrite ne change plus, et un remboursement n'a qu'une ligne", async () => {
    await ctx.prisma.$executeRaw`
      INSERT INTO "public"."refund_credit" ("refund_id", "credit_note_id", "reason", "created_at")
      VALUES ('rfd_d', NULL, 'adjustment', now())`;
    await expect(
      ctx.prisma.$executeRaw`
        INSERT INTO "public"."refund_credit" ("refund_id", "credit_note_id", "reason", "created_at")
        VALUES ('rfd_d', NULL, 'adjustment', now())`,
    ).rejects.toThrow(/refund_credit_pkey|Unique constraint/);
    await expect(
      ctx.prisma.$executeRaw`
        UPDATE "public"."refund_credit" SET "created_at" = now() - interval '1 day'
         WHERE "refund_id" = 'rfd_d'`,
    ).rejects.toThrow(/est écrit .* et ne change plus/);
  });
});

describe("pas de DELETE, sauf la purge", () => {
  it("refuse un DELETE nu sur les deux tables, l'admet sous SET LOCAL card_payment.purge", async () => {
    const paymentId = await aPayment();
    const row = request(paymentId);
    await insertRequest(row);
    const line = refund(paymentId, { requestId: row.id });
    await insertRefund(line);

    await expect(
      ctx.prisma.$executeRaw`DELETE FROM "card_payment"."refund" WHERE "id" = ${line.id}`,
    ).rejects.toThrow(/un remboursement ne s'efface pas/);
    await expect(
      ctx.prisma.$executeRaw`DELETE FROM "card_payment"."refund_request" WHERE "id" = ${row.id}`,
    ).rejects.toThrow(/un remboursement ne s'efface pas/);

    await ctx.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL card_payment.purge = 'on'`;
      await tx.$executeRaw`DELETE FROM "card_payment"."refund" WHERE "id" = ${line.id}`;
      await tx.$executeRaw`DELETE FROM "card_payment"."refund_request" WHERE "id" = ${row.id}`;
    });
    expect(await ctx.prisma.cardRefund.count()).toBe(0);
    expect(await ctx.prisma.cardRefundRequest.count()).toBe(0);
  });

  it("une demande tenue par le carnet ne s'efface pas avant lui, même sous la purge", async () => {
    const paymentId = await aPayment();
    const row = request(paymentId);
    await insertRequest(row);
    await insertRefund(refund(paymentId, { requestId: row.id }));
    await expect(
      ctx.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL card_payment.purge = 'on'`;
        await tx.$executeRaw`DELETE FROM "card_payment"."refund_request" WHERE "id" = ${row.id}`;
      }),
    ).rejects.toThrow(/refund_request_id_fkey|Foreign key/);
  });
});

describe("la purge du scénario (§5.4)", () => {
  it("efface les liens d'avoir, le carnet, les demandes et les paiements de ses commandes, et eux seuls", async () => {
    const kept = await aPayment("ord_hors_scenario");
    const purged = await aPayment("ord_du_scenario");
    for (const paymentId of [kept, purged]) {
      const row = request(paymentId, { state: "refunded" });
      await insertRequest(row);
      const line = refund(paymentId, { requestId: row.id, status: "succeeded" });
      await insertRefund(line);
      await ctx.prisma.$executeRaw`
        INSERT INTO "public"."refund_credit" ("refund_id", "credit_note_id", "reason", "created_at")
        VALUES (${line.id}, NULL, 'adjustment', now())`;
    }

    const removed = await ctx.prisma.$transaction((tx) =>
      purgeCardPayments(tx, {
        companyIds: [],
        userIds: [],
        orderIds: ["ord_du_scenario"],
        orderNumbers: [],
        days: [],
      }),
    );

    expect(removed).toBe(4);
    expect(await ctx.prisma.cardPayment.findMany({ select: { id: true } })).toEqual([{ id: kept }]);
    expect(await ctx.prisma.cardRefund.count({ where: { paymentId: purged } })).toBe(0);
    expect(await ctx.prisma.cardRefundRequest.count({ where: { paymentId: purged } })).toBe(0);
    expect(await ctx.prisma.cardRefund.count({ where: { paymentId: kept } })).toBe(1);
    expect(await ctx.prisma.refundCredit.count()).toBe(1);
  });
});
