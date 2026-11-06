import {
  describePurge,
  isPurgeMode,
  type PurgeCensus,
  type PurgeTarget,
  runPurge,
} from "../purge-mode.js";

const CUTOFF = new Date(0);
const OLDEST = new Date(1);

/** Une table en mémoire de `rows` lignes éligibles, supprimées par lots. */
class InMemoryTarget implements PurgeTarget {
  readonly limits: number[] = [];
  censusCalls = 0;
  constructor(public rows: number) {}
  census(): Promise<PurgeCensus> {
    this.censusCalls += 1;
    return Promise.resolve({ count: this.rows, oldest: this.rows === 0 ? null : OLDEST });
  }
  pruneBatch(_cutoff: Date, limit: number): Promise<number> {
    this.limits.push(limit);
    const batch = Math.min(limit, this.rows);
    this.rows -= batch;
    return Promise.resolve(batch);
  }
}

describe("runPurge", () => {
  it("off : ne lit rien et ne supprime rien", async () => {
    const target = new InMemoryTarget(7);

    await expect(runPurge("off", target, CUTOFF, 3)).resolves.toEqual({
      mode: "off",
      eligible: null,
      purged: 0,
      oldest: null,
    });
    expect(target.censusCalls).toBe(0);
    expect(target.rows).toBe(7);
  });

  it("dry-run : compte juste, et ne supprime rien", async () => {
    const target = new InMemoryTarget(7);

    await expect(runPurge("dry-run", target, CUTOFF, 3)).resolves.toEqual({
      mode: "dry-run",
      eligible: 7,
      purged: 0,
      oldest: OLDEST,
    });
    expect(target.limits).toEqual([]);
    expect(target.rows).toBe(7);
  });

  it("on : enchaîne les lots bornés jusqu'au lot incomplet", async () => {
    const target = new InMemoryTarget(7);

    await expect(runPurge("on", target, CUTOFF, 3)).resolves.toMatchObject({
      mode: "on",
      eligible: 7,
      purged: 7,
    });
    expect(target.limits).toEqual([3, 3, 3]);
    expect(target.rows).toBe(0);
  });

  it("on : un lot plein suivi d'un lot vide s'arrête", async () => {
    const target = new InMemoryTarget(3);

    await runPurge("on", target, CUTOFF, 3);

    expect(target.limits).toEqual([3, 3]);
  });

  it("on : idempotent, le second passage ne trouve plus rien", async () => {
    const target = new InMemoryTarget(2);
    await runPurge("on", target, CUTOFF, 3);

    await expect(runPurge("on", target, CUTOFF, 3)).resolves.toMatchObject({
      eligible: 0,
      purged: 0,
      oldest: null,
    });
  });
});

describe("isPurgeMode", () => {
  it("n'admet que off, dry-run et on", () => {
    expect(["off", "dry-run", "on"].every(isPurgeMode)).toBe(true);
    expect(isPurgeMode("true")).toBe(false);
    expect(isPurgeMode("")).toBe(false);
  });
});

describe("describePurge", () => {
  it("à blanc, dit que rien n'est supprimé", () => {
    const line = describePurge("x", { mode: "dry-run", eligible: 4, purged: 0, oldest: null });
    expect(line).toContain("4 ligne(s) seraient supprimées");
    expect(line).toContain("rien n'est supprimé");
  });
});
