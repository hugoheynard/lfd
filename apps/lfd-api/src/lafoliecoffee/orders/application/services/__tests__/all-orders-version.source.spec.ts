import { OrderChangeVersionReader } from "../../../domain/ports/order-change-version.reader.js";
import { AllOrdersVersionSource } from "../all-orders-version.source.js";

class FixedReader extends OrderChangeVersionReader {
  versionOf(): Promise<number> {
    return Promise.resolve(42);
  }
}

describe("AllOrdersVersionSource", () => {
  it("rend le numéro du journal de toutes les commandes", async () => {
    await expect(new AllOrdersVersionSource(new FixedReader()).versionOf()).resolves.toBe(42);
  });

  it("🔴 ne s'ouvre qu'à `b2b_orders:read`, jamais aux droits du comptoir ni de la Supervision", () => {
    expect(new AllOrdersVersionSource(new FixedReader()).readers).toEqual(["b2b_orders:read"]);
  });
});
