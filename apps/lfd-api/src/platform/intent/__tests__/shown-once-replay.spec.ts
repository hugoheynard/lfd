import { BusinessError } from "../../shared/errors/app-error.js";
import { FixedClock } from "../../time/fixed-clock.js";
import type { GestureIntent } from "../gesture-intent.js";
import { OncePerIntent } from "../once-per-intent.js";
import { shownOnceReplay } from "../shown-once-replay.js";
import { InMemoryGestureIntentLedger } from "./in-memory-gesture-intent.ledger.js";

class AlreadyShownError extends BusinessError {
  constructor() {
    super("test.already_shown", "Ce secret a déjà été montré : émettez-en un nouveau.");
  }
}

const INTENT: GestureIntent = {
  actorId: "fiche-1",
  key: "0b7f6f0e-8a52-4c1e-9d43-0d8e5f0a1b2c",
  gesture: "test.issue-secret",
  subject: "s1",
};

const CODEC = shownOnceReplay<{ readonly id: string; readonly secret: string }>(
  (result) => ({ id: result.id }),
  () => new AlreadyShownError(),
);

describe("shownOnceReplay — un secret montré une fois", () => {
  it("ne garde que l'identifiant, jamais le secret", () => {
    expect(CODEC.write({ id: "x1", secret: "s3cr3t" })).toEqual({ id: "x1" });
  });

  it("un rejeu de la même clé est refusé en 409 nommé, sans refaire le geste", async () => {
    const ledger = new InMemoryGestureIntentLedger();
    const once = new OncePerIntent(ledger, new FixedClock(new Date(0)));
    let calls = 0;
    const gesture = (): Promise<{ readonly id: string; readonly secret: string }> => {
      calls += 1;
      return Promise.resolve({ id: "x1", secret: "s3cr3t" });
    };

    await expect(once.runSealed(INTENT, CODEC, gesture)).resolves.toEqual({
      id: "x1",
      secret: "s3cr3t",
    });
    await expect(once.runSealed(INTENT, CODEC, gesture)).rejects.toBeInstanceOf(AlreadyShownError);
    expect(calls).toBe(1);
  });
});
