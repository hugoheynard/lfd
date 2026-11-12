import { CompanyWarningsCounter } from "../../../domain/ports/company-warnings.counter.js";
import { CountCompanyWarningsHandler } from "../count-company-warnings.handler.js";

class FixedCounter extends CompanyWarningsCounter {
  calls = 0;

  constructor(private readonly value: number) {
    super();
  }

  count(): Promise<number> {
    this.calls += 1;
    return Promise.resolve(this.value);
  }
}

describe("CountCompanyWarningsHandler", () => {
  it("rend le nombre du compteur, enveloppé pour le menu", async () => {
    const counter = new FixedCounter(3);

    await expect(new CountCompanyWarningsHandler(counter).execute()).resolves.toEqual({
      count: 3,
    });
    expect(counter.calls).toBe(1);
  });

  it("rend zéro quand aucun dossier n'appelle de geste", async () => {
    await expect(new CountCompanyWarningsHandler(new FixedCounter(0)).execute()).resolves.toEqual({
      count: 0,
    });
  });
});
