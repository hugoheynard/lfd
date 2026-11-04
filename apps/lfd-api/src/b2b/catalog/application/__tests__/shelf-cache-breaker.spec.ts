import {
  SHELF_BREAKER_FAILURES,
  SHELF_BREAKER_PAUSE_MS,
  ShelfCacheBreaker,
} from "../shelf-cache-breaker.js";

/** Le disjoncteur seul, sur des millisecondes données (§ 4 bis du plan du cache). */
describe("ShelfCacheBreaker", () => {
  function failedTimes(breaker: ShelfCacheBreaker, times: number, atMs = 0): string[] {
    return Array.from({ length: times }, () => String(breaker.failed(atMs)));
  }

  it("reste fermé sous le seuil d'échecs de suite", () => {
    const breaker = new ShelfCacheBreaker();
    expect(failedTimes(breaker, SHELF_BREAKER_FAILURES - 1)).not.toContain("opened");
    expect(breaker.allows(0)).toBe(true);
  });

  it("s'ouvre au seuil, et refuse tout appel pendant la pause", () => {
    const breaker = new ShelfCacheBreaker();
    const transitions = failedTimes(breaker, SHELF_BREAKER_FAILURES, 1000);
    expect(transitions.at(-1)).toBe("opened");
    expect(breaker.allows(1000 + SHELF_BREAKER_PAUSE_MS - 1)).toBe(false);
    expect(breaker.allows(1000 + SHELF_BREAKER_PAUSE_MS)).toBe(true);
  });

  it("un succès remet le compte à zéro : les échecs doivent être DE SUITE", () => {
    const breaker = new ShelfCacheBreaker();
    failedTimes(breaker, SHELF_BREAKER_FAILURES - 1);
    expect(breaker.succeeded()).toBeNull();
    expect(failedTimes(breaker, SHELF_BREAKER_FAILURES - 1)).not.toContain("opened");
  });

  it("après la pause, un succès le referme", () => {
    const breaker = new ShelfCacheBreaker();
    failedTimes(breaker, SHELF_BREAKER_FAILURES);
    expect(breaker.succeeded()).toBe("closed");
    expect(breaker.allows(0)).toBe(true);
  });

  it("après la pause, un échec le rouvre pour une nouvelle pause", () => {
    const breaker = new ShelfCacheBreaker();
    failedTimes(breaker, SHELF_BREAKER_FAILURES, 0);
    const retryAt = SHELF_BREAKER_PAUSE_MS;
    expect(breaker.failed(retryAt)).toBe("opened");
    expect(breaker.allows(retryAt + 1)).toBe(false);
    expect(breaker.allows(retryAt + SHELF_BREAKER_PAUSE_MS)).toBe(true);
  });
});
