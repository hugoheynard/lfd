/**
 * E2E **le bail d'une intention scellée** sur la vraie base : deux appels de
 * la même intention, le premier plus long que le bail, chacun dans sa propre
 * transaction.
 *
 * Ce que seule cette suite prouve : sous Postgres, le scellement du second
 * appel qui aboutit fait échouer celui du premier (aucune ligne non résolue),
 * et sa transaction est annulée — le geste ne s'écrit qu'une fois. Et une
 * réclamation faite dans une unité de travail déjà ouverte est refusée.
 *
 * Les deux horloges sont fixées l'une par rapport à l'autre (le bail) ; aucune
 * n'est comparée au mur.
 */
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import {
  GESTURE_INTENT_LEASE_MS,
  type GestureIntent,
  GestureIntentLedger,
} from "../src/platform/intent/gesture-intent.js";
import {
  IntentAlreadySealedError,
  IntentClaimInsideTransactionError,
} from "../src/platform/intent/intent-errors.js";
import { MAIL_SENT_REPLAY, OncePerIntent } from "../src/platform/intent/once-per-intent.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { bootstrapE2e, daysAgo, type E2eContext } from "./e2e-harness.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const INTENT: GestureIntent = {
  actorId: "staff_lease",
  key: "8f1e2d3c-4b5a-4c6d-9e8f-7a6b5c4d3e2f",
  gesture: "test.lease",
  subject: "sujet",
};

/** La garde réelle, sur le registre Prisma, avec sa propre horloge. */
function guardAt(instant: Date): OncePerIntent {
  return new OncePerIntent(ctx.app.get(GestureIntentLedger), new FixedClock(instant));
}

/** L'écriture du geste : une ligne témoin, dans la transaction de l'appel. */
async function writeWitness(name: string, at: Date): Promise<void> {
  await ctx.prisma.gestureIntent.create({
    data: { id: name, actorId: "witness", key: name, gesture: "w", subject: "w", claimedAt: at },
  });
}

describe("OncePerIntent.runSealed sur Postgres — le bail dépassé", () => {
  /**
   * Régression : un geste plus long que le bail était repris par un second
   * appel ; la résolution perdante ne touchait aucune ligne sans le dire, et
   * le geste s'écrivait deux fois.
   */
  it("l'appel repris scelle le premier ; le premier est annulé, son écriture avec lui", async () => {
    const uow = ctx.app.get(UnitOfWork);
    const start = new Date(daysAgo(0));
    let letSlowWrite: () => void = () => undefined;
    const slowMayWrite = new Promise<void>((resolve) => {
      letSlowWrite = resolve;
    });
    let slowClaimed: () => void = () => undefined;
    const slowHasClaimed = new Promise<void>((resolve) => {
      slowClaimed = resolve;
    });

    const slow = guardAt(start).runSealed(INTENT, MAIL_SENT_REPLAY, async (seal) => {
      slowClaimed();
      await slowMayWrite;
      return uow.run(async () => {
        await writeWitness("slow", start);
        await seal({ mailSent: true });
        return { mailSent: true };
      });
    });
    await slowHasClaimed;

    const afterLease = new Date(start.getTime() + GESTURE_INTENT_LEASE_MS + 1);
    await expect(
      guardAt(afterLease).runSealed(INTENT, MAIL_SENT_REPLAY, (seal) =>
        uow.run(async () => {
          await writeWitness("retry", afterLease);
          await seal({ mailSent: false });
          return { mailSent: false };
        }),
      ),
    ).resolves.toEqual({ mailSent: false });
    letSlowWrite();

    await expect(slow).rejects.toBeInstanceOf(IntentAlreadySealedError);
    const witnesses = await ctx.prisma.gestureIntent.findMany({
      where: { actorId: "witness" },
      select: { id: true },
    });
    expect(witnesses.map((row) => row.id)).toEqual(["retry"]);
    const held = await ctx.prisma.gestureIntent.findUniqueOrThrow({
      where: { actorId_key: { actorId: INTENT.actorId, key: INTENT.key } },
      select: { result: true },
    });
    expect(held.result).toEqual({ mailSent: false });
  });

  it("une réclamation dans une unité de travail déjà ouverte est refusée, rien n'est écrit", async () => {
    const uow = ctx.app.get(UnitOfWork);

    await expect(
      uow.run(() =>
        guardAt(new Date(daysAgo(0))).runSealed(INTENT, MAIL_SENT_REPLAY, () =>
          Promise.resolve({ mailSent: true }),
        ),
      ),
    ).rejects.toBeInstanceOf(IntentClaimInsideTransactionError);
    expect(await ctx.prisma.gestureIntent.count()).toBe(0);
  });
});
