/**
 * **Le verrou d'une ligne du bloc `payment`, et les noms écrits à la main.**
 *
 * `lockRow` / `lockRows` (`src/payment/shared/infrastructure/row-lock.ts`)
 * portent en SQL brut le nom qualifié de chaque table qu'un dépôt verrouille :
 * le compilateur ne les voit pas. Ce fichier confronte chaque table déclarée au
 * catalogue Postgres, puis prend réellement chaque verrou et constate qu'une
 * autre connexion ne peut pas le prendre.
 *
 * Il relit aussi, dans le catalogue, les noms que Prisma ne connaît pas (les
 * CHECK, les index partiels, les déclencheurs) : `prisma migrate diff` ne les
 * voit pas, un renommage oublié ne se lirait nulle part ailleurs.
 */
import { Client } from "pg";

import { Prisma } from "../src/platform/database/client/client.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import {
  LOCKABLE_TABLES,
  type LockableTable,
  lockRow,
  lockRows,
} from "../src/payment/shared/infrastructure/row-lock.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";
import { testDatabaseUrl } from "./setup-env.js";

/** Le code Postgres d'un verrou refusé par `NOWAIT`. */
const LOCK_NOT_AVAILABLE = "55P03";

let ctx: E2eContext;
let other: Client;

beforeAll(async () => {
  ctx = await bootstrapE2e();
  other = new Client({ connectionString: testDatabaseUrl() });
  await other.connect();
});

afterAll(async () => {
  await other.end();
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const TABLES = Object.keys(LOCKABLE_TABLES) as LockableTable[];

/** Les lignes à verrouiller : un lien, un paiement né de lui, une demande, un essai. */
async function seed(): Promise<void> {
  await ctx.prisma.$executeRaw`
    INSERT INTO "payment"."pay_link_test"
      ("id", "amount_cents", "state", "created_at", "created_by_staff_id")
    VALUES ('plt_lock', 100, 'sent', now(), 'staff_lock')`;
  await ctx.prisma.$executeRaw`
    INSERT INTO "payment"."pay_link"
      ("id", "subject_type", "subject_id", "origin", "payer_label", "token_hash",
       "token_sealed", "created_at", "created_by")
    VALUES ('pl_lock', 'order', 'ord_lock', 'lafoliecoffee', 'X', 'h_lock', 's_lock',
            now(), 'system')`;
  await ctx.prisma.$executeRaw`
    INSERT INTO "payment"."card_payment"
      ("id", "subject_type", "subject_id", "account", "provider_ref", "role",
       "amount_cents", "state", "created_at", "pay_link_id")
    VALUES ('pay_lock', 'order', 'ord_lock', 'lfc-stripe', 'pi_lock', 'first',
            5000, 'paid', now(), 'pl_lock')`;
  await ctx.prisma.$executeRaw`
    INSERT INTO "payment"."card_refund_request"
      ("id", "payment_id", "form", "amount_cents", "nature", "reason", "state",
       "announced_cents", "requested_at")
    VALUES ('req_lock', 'pay_lock', 'remainder', NULL, 'return', 'cancellation',
            'to_issue', 5000, now())`;
}

const ROW_OF: Readonly<Record<LockableTable, string>> = {
  card_payment: "pay_lock",
  card_refund_request: "req_lock",
  pay_link: "pl_lock",
  pay_link_test: "plt_lock",
};

/** Tente le même verrou depuis une autre connexion, sans attendre. */
async function lockFromElsewhere(table: LockableTable, id: string): Promise<string | null> {
  try {
    await other.query(
      `SELECT "id" FROM ${LOCKABLE_TABLES[table].sql} WHERE "id" = $1 FOR UPDATE NOWAIT`,
      [id],
    );
    return null;
  } catch (error: unknown) {
    return error instanceof Error && "code" in error ? String(error.code) : "unknown";
  }
}

describe("lockRow — les tables déclarées existent", () => {
  it.each(TABLES)("%s est une table du catalogue", async (table) => {
    const rows = await ctx.prisma.$queryRaw<{ found: string | null }[]>`
      SELECT to_regclass(${LOCKABLE_TABLES[table].sql})::text AS "found"`;
    expect(rows[0]?.found).toBe(`payment.${table}`);
  });
});

describe("lockRow — le verrou est réellement pris", () => {
  it.each(TABLES)(
    "%s : une autre connexion ne prend pas la ligne pendant la transaction",
    async (table) => {
      await seed();
      const id = ROW_OF[table];
      const seen = await ctx.app.get(UnitOfWork).run(async () => {
        await lockRow(ctx.prisma, table, id);
        return lockFromElsewhere(table, id);
      });
      expect(seen).toBe(LOCK_NOT_AVAILABLE);
      expect(await lockFromElsewhere(table, id)).toBeNull();
    },
  );

  it("pay_link : le verrou par sujet prend le lien vivant", async () => {
    await seed();
    const seen = await ctx.app.get(UnitOfWork).run(async () => {
      await lockRows(
        ctx.prisma,
        "pay_link",
        Prisma.sql`"subject_type" = 'order' AND "subject_id" = 'ord_lock' AND "revoked_at" IS NULL`,
      );
      return lockFromElsewhere("pay_link", "pl_lock");
    });
    expect(seen).toBe(LOCK_NOT_AVAILABLE);
  });
});

describe("le schéma payment — les noms écrits à la main", () => {
  it("les CHECK, index partiels et déclencheurs portent le nom de leur table", async () => {
    const names = await ctx.prisma.$queryRaw<{ name: string }[]>`
      SELECT conname::text AS "name" FROM pg_constraint
       WHERE connamespace = 'payment'::regnamespace AND contype = 'c'
      UNION ALL
      SELECT indexname::text FROM pg_indexes WHERE schemaname = 'payment'
      UNION ALL
      SELECT t.tgname::text FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
       WHERE c.relnamespace = 'payment'::regnamespace AND NOT t.tgisinternal`;
    const all = names.map((row) => row.name);
    expect(all).toEqual(
      expect.arrayContaining([
        "card_payment_account_known",
        "card_payment_amount_positive",
        "card_payment_first_per_subject_key",
        "card_payment_guard",
        "card_payment_no_delete",
        "card_refund_request_remainder_in_progress_key",
        "card_refund_request_guard",
        "card_refund_request_no_delete",
        "card_refund_guard",
        "card_refund_no_delete",
        "card_takeover_no_delete",
        "pay_link_live_per_subject_key",
        "pay_link_guard",
        "pay_link_no_delete",
        "pay_link_test_amount_fixed",
        "pay_link_test_state_known",
        "pay_link_test_paid_pair",
        "pay_link_test_refunded_pair",
        "pay_link_test_author_present",
        "pay_link_test_guard",
        "pay_link_test_no_delete",
        "transfer_received_append_only",
        "transfer_allocation_append_only",
        "transfer_allocation_subject_type_known",
      ]),
    );
    const prefixes = [
      "card_payment_",
      "card_refund_",
      "card_takeover_",
      "pay_link_",
      "transfer_received_",
      "transfer_allocation_",
    ];
    expect(all.filter((name) => !prefixes.some((prefix) => name.startsWith(prefix)))).toEqual([]);
  });
});
