import { FixedStopwatch, RecordingTimings } from "../../metrics/__tests__/metrics-doubles.js";
import { FixedWallClock } from "../../time/fixed-wall-clock.js";
import {
  BoundedCallGuard,
  type CallFallbackReason,
  type CallGuardListener,
} from "../bounded-call-guard.js";
import { CallBreaker } from "../call-breaker.js";
import { ScriptedCallDeadline } from "./cache-call-doubles.js";

class RecordingListener implements CallGuardListener<"read"> {
  readonly heard: string[] = [];
  fallback(operation: "read", reason: CallFallbackReason): void {
    this.heard.push(`fallback:${operation}:${reason}`);
  }
  breakerOpened(failures: number): void {
    this.heard.push(`opened:${failures}`);
  }
  breakerClosed(): void {
    this.heard.push("closed");
  }
}

class UnreadableReply extends RangeError {}

// L'instant du mur, comparé à lui-même seulement (disjoncteur).
const WALL_START = new Date(Date.UTC(2030, 0, 1));

function rig() {
  const deadline = new ScriptedCallDeadline();
  const timings = new RecordingTimings();
  const listener = new RecordingListener();
  const wall = new FixedWallClock(WALL_START);
  const guard = new BoundedCallGuard<"read">({
    cache: "essai",
    limitMs: 400,
    breaker: new CallBreaker(2, 30_000),
    deadline,
    wall,
    stopwatch: new FixedStopwatch(9),
    timings,
    listener,
    isUnreadable: (error) => error instanceof UnreadableReply,
  });
  return { guard, deadline, timings, listener, wall };
}

describe("BoundedCallGuard — un appel borné à un cache nommé", () => {
  it("rend la valeur à temps et la mesure sous le nom du cache", async () => {
    const { guard, deadline, timings } = rig();

    await expect(guard.call("read", () => Promise.resolve(42), true)).resolves.toBe(42);
    expect(deadline.limits).toEqual([400]);
    expect(timings.recorded).toEqual([
      {
        name: "essai.round_trip",
        labels: { operation: "read", outcome: "in_time" },
        ms: 9,
        size: 1,
      },
    ]);
  });

  it("rend null au délai, le compte `timeout`, et mesure la fin de l'appel abandonné", async () => {
    const { guard, deadline, timings, listener } = rig();
    deadline.late = true;

    await expect(guard.call("read", () => Promise.resolve(1), true, 50)).resolves.toBeNull();
    await Promise.resolve();
    expect(deadline.limits).toEqual([50]);
    expect(listener.heard).toEqual(["fallback:read:timeout"]);
    expect(timings.recorded.map((one) => one.name)).toEqual([
      "essai.round_trip",
      "essai.fallback",
      "essai.late_finish",
    ]);
  });

  it("distingue une réponse illisible d'une panne", async () => {
    const { guard, listener } = rig();

    await guard.call("read", () => Promise.reject(new UnreadableReply("x")), true);
    await guard.call("read", () => Promise.reject(new TypeError("réseau")), false);
    expect(listener.heard).toEqual(["fallback:read:unreadable", "fallback:read:error"]);
  });

  it("ouvre le disjoncteur au seuil, puis n'appelle plus pendant la pause", async () => {
    const { guard, listener, wall } = rig();
    const failing = () => Promise.reject(new TypeError("panne"));
    await guard.call("read", failing, true);
    await guard.call("read", failing, true);
    let called = false;

    await guard.call(
      "read",
      () => {
        called = true;
        return Promise.resolve(1);
      },
      true,
    );
    expect(called).toBe(false);
    expect(listener.heard).toEqual([
      "fallback:read:error",
      "fallback:read:error",
      "opened:2",
      "fallback:read:breaker_open",
    ]);

    wall.advanceMs(30_000);
    await expect(guard.call("read", () => Promise.resolve(7), true)).resolves.toBe(7);
    expect(listener.heard.at(-1)).toBe("closed");
  });

  /**
   * Régression : un repli imposé par le disjoncteur ouvert ne laissait aucune
   * mesure — l'onglet Cache ne voyait ni l'ouverture ni les relectures en base.
   */
  it("compte chaque repli par raison, disjoncteur ouvert compris, et son ouverture", async () => {
    const { guard, timings } = rig();
    const failing = () => Promise.reject(new TypeError("panne"));
    await guard.call("read", failing, true);
    await guard.call("read", failing, true);
    await guard.call("read", () => Promise.resolve(1), true);

    const counted = timings.recorded
      .filter((one) => one.name !== "essai.round_trip")
      .map((one) => `${one.name}:${one.labels["reason"] ?? ""}`);
    expect(counted).toEqual([
      "essai.fallback:error",
      "essai.fallback:error",
      "essai.breaker_opened:",
      "essai.fallback:breaker_open",
    ]);
  });
});
