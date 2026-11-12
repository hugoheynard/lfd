import { CallBreaker } from "../call-breaker.js";

/** Le disjoncteur générique, sur des millisecondes données. */
describe("CallBreaker", () => {
  it("s'ouvre au seuil donné, refuse pendant la pause, puis laisse réessayer", () => {
    const breaker = new CallBreaker(2, 1000);

    expect(breaker.failed(0)).toBeNull();
    expect(breaker.failed(0)).toBe("opened");
    expect(breaker.allows(999)).toBe(false);
    expect(breaker.allows(1000)).toBe(true);
  });

  it("se referme au premier succès après une ouverture, et le dit", () => {
    const breaker = new CallBreaker(1, 1000);
    breaker.failed(0);

    expect(breaker.succeeded()).toBe("closed");
    expect(breaker.consecutiveFailures()).toBe(0);
    expect(breaker.succeeded()).toBeNull();
  });

  it("se rouvre pour une nouvelle pause sur un échec après la pause", () => {
    const breaker = new CallBreaker(1, 1000);
    breaker.failed(0);

    expect(breaker.failed(1000)).toBe("opened");
    expect(breaker.allows(1999)).toBe(false);
  });
});
