import { FixedClock } from "../../time/fixed-clock.js";
import {
  GESTURE_INTENT_LEASE_MS,
  type GestureIntent,
  type IntentRecord,
} from "../gesture-intent.js";
import {
  GestureInFlightError,
  IntentAlreadySealedError,
  IntentKeyReusedError,
  IntentRecordUnreadableError,
} from "../intent-errors.js";
import { MAIL_SENT_REPLAY, OncePerIntent, readIntentChoice } from "../once-per-intent.js";
import { InMemoryGestureIntentLedger } from "./in-memory-gesture-intent.ledger.js";

const INTENT: GestureIntent = {
  actorId: "fiche-1",
  key: "0b7f6f0e-8a52-4c1e-9d43-0d8e5f0a1b2c",
  gesture: "account.invite-member",
  subject: "cmp_1",
};

function harness() {
  const clock = new FixedClock(new Date(0));
  const ledger = new InMemoryGestureIntentLedger();
  return { clock, ledger, once: new OncePerIntent(ledger, clock) };
}

/** Un geste compté, qui rend « parti » ou lève. */
function gesture(outcome: boolean | Error = true) {
  const calls = { count: 0 };
  const run = (): Promise<{ readonly mailSent: boolean }> => {
    calls.count += 1;
    return outcome instanceof Error
      ? Promise.reject(outcome)
      : Promise.resolve({ mailSent: outcome });
  };
  return { calls, run };
}

describe("OncePerIntent — un geste par intention (revue de S2, cas 4)", () => {
  it("exécute une intention neuve et rend son résultat", async () => {
    const { once } = harness();
    const g = gesture(true);

    await expect(once.run(INTENT, MAIL_SENT_REPLAY, g.run)).resolves.toEqual({ mailSent: true });
    expect(g.calls.count).toBe(1);
  });

  it("un second appel de même intention ne réexécute rien et rend le premier résultat", async () => {
    const { once } = harness();
    const first = gesture(false);
    const second = gesture(true);

    await once.run(INTENT, MAIL_SENT_REPLAY, first.run);
    await expect(once.run(INTENT, MAIL_SENT_REPLAY, second.run)).resolves.toEqual({
      mailSent: false,
    });
    expect(second.calls.count).toBe(0);
  });

  it("une clé neuve est un geste neuf : un vrai renvoi repart", async () => {
    const { once } = harness();
    const g = gesture(true);

    await once.run(INTENT, MAIL_SENT_REPLAY, g.run);
    await once.run(
      { ...INTENT, key: "5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f" },
      MAIL_SENT_REPLAY,
      g.run,
    );
    expect(g.calls.count).toBe(2);
  });

  it("la même clé sur un autre sujet est refusée, jamais rejouée", async () => {
    const { once } = harness();
    await once.run(INTENT, MAIL_SENT_REPLAY, gesture().run);

    await expect(
      once.run({ ...INTENT, subject: "cmp_2" }, MAIL_SENT_REPLAY, gesture().run),
    ).rejects.toBeInstanceOf(IntentKeyReusedError);
    await expect(
      once.run({ ...INTENT, gesture: "staff.invite" }, MAIL_SENT_REPLAY, gesture().run),
    ).rejects.toBeInstanceOf(IntentKeyReusedError);
  });

  it("la même clé pour une autre personne est une autre intention", async () => {
    const { once } = harness();
    const g = gesture();
    await once.run(INTENT, MAIL_SENT_REPLAY, g.run);
    await once.run({ ...INTENT, actorId: "fiche-2" }, MAIL_SENT_REPLAY, g.run);
    expect(g.calls.count).toBe(2);
  });

  it("une intention encore en vol est refusée en 409 nommé ; reprise après le bail", async () => {
    const { once, ledger, clock } = harness();
    await ledger.claim(INTENT, clock.now());
    const g = gesture();

    await expect(once.run(INTENT, MAIL_SENT_REPLAY, g.run)).rejects.toBeInstanceOf(
      GestureInFlightError,
    );
    clock.advanceMs(GESTURE_INTENT_LEASE_MS);
    await expect(once.run(INTENT, MAIL_SENT_REPLAY, g.run)).resolves.toEqual({ mailSent: true });
    expect(g.calls.count).toBe(1);
  });

  it("un geste qui échoue rend l'intention : le même clic réessaie", async () => {
    const { once } = harness();
    const failing = gesture(new Error("fournisseur indisponible"));
    const ok = gesture(true);

    await expect(once.run(INTENT, MAIL_SENT_REPLAY, failing.run)).rejects.toThrow(
      "fournisseur indisponible",
    );
    await expect(once.run(INTENT, MAIL_SENT_REPLAY, ok.run)).resolves.toEqual({ mailSent: true });
    expect(ok.calls.count).toBe(1);
  });

  it("un résultat gardé illisible lève une erreur technique nommée", () => {
    expect(() => MAIL_SENT_REPLAY.read({ mailSent: "oui" }, "staff.invite")).toThrow(
      IntentRecordUnreadableError,
    );
    expect(() => readIntentChoice({ holder: "inconnu" }, "holder", "g", ["attached"])).toThrow(
      IntentRecordUnreadableError,
    );
  });
});

describe("OncePerIntent.runSealed — le résultat gardé avec l'écriture", () => {
  /** Le registre qui note l'ordre des gestes et des résolutions. */
  function tracing() {
    const trace: string[] = [];
    class Ledger extends InMemoryGestureIntentLedger {
      override resolve(intent: GestureIntent, result: IntentRecord): Promise<boolean> {
        trace.push("resolve");
        return super.resolve(intent, result);
      }
    }
    return { trace, once: new OncePerIntent(new Ledger(), new FixedClock(new Date(0))) };
  }

  it("résout au moment où le geste scelle, une seule fois", async () => {
    const { trace, once } = tracing();

    const result = await once.runSealed(INTENT, MAIL_SENT_REPLAY, async (seal) => {
      trace.push("write");
      await seal({ mailSent: true });
      trace.push("after seal");
      return { mailSent: true };
    });

    expect(result).toEqual({ mailSent: true });
    expect(trace).toEqual(["write", "resolve", "after seal"]);
  });

  it("un geste qui n'a pas scellé est résolu après coup, et se rejoue", async () => {
    const { trace, once } = tracing();

    await once.runSealed(INTENT, MAIL_SENT_REPLAY, () => Promise.resolve({ mailSent: false }));
    const replayed = await once.runSealed(INTENT, MAIL_SENT_REPLAY, () =>
      Promise.resolve({ mailSent: true }),
    );

    expect(replayed).toEqual({ mailSent: false });
    expect(trace).toEqual(["resolve"]);
  });

  it("un échec avant le sceau rend l'intention : la même clé réessaie", async () => {
    const { once } = tracing();

    await expect(
      once.runSealed(INTENT, MAIL_SENT_REPLAY, () => Promise.reject(new Error("refusé"))),
    ).rejects.toThrow("refusé");
    await expect(
      once.runSealed(INTENT, MAIL_SENT_REPLAY, () => Promise.resolve({ mailSent: true })),
    ).resolves.toEqual({ mailSent: true });
  });

  /**
   * Régression : un geste plus long que le bail était repris par un second
   * appel, et la résolution perdante, qui ne touchait aucune ligne, laissait
   * sa transaction écrire le geste une seconde fois.
   */
  it("un appel repris après le bail qui scelle en second lève, pour annuler son écriture", async () => {
    const clock = new FixedClock(new Date(0));
    const once = new OncePerIntent(new InMemoryGestureIntentLedger(), clock);
    const writes: string[] = [];
    let releaseSlow: () => void = () => undefined;
    const slowMayFinish = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });

    const slow = once.runSealed(INTENT, MAIL_SENT_REPLAY, async (seal) => {
      await slowMayFinish;
      writes.push("slow");
      await seal({ mailSent: true });
      return { mailSent: true };
    });
    await Promise.resolve();
    clock.set(new Date(GESTURE_INTENT_LEASE_MS + 1));
    await expect(
      once.runSealed(INTENT, MAIL_SENT_REPLAY, async (seal) => {
        writes.push("retry");
        await seal({ mailSent: false });
        return { mailSent: false };
      }),
    ).resolves.toEqual({ mailSent: false });
    releaseSlow();

    await expect(slow).rejects.toBeInstanceOf(IntentAlreadySealedError);
    expect(writes).toEqual(["retry", "slow"]);
  });
});
