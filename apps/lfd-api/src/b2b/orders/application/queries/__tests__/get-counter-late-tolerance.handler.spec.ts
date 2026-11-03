import { LateToleranceReader } from "../../../domain/ports/late-tolerance.reader.js";
import { GetCounterLateToleranceHandler } from "../get-counter-late-tolerance.handler.js";

class FixedLateTolerance extends LateToleranceReader {
  constructor(private readonly minutes: number) {
    super();
  }

  lateToleranceMinutes(): Promise<number> {
    return Promise.resolve(this.minutes);
  }
}

describe("GetCounterLateToleranceHandler", () => {
  it("rend au comptoir la tolérance de retard du réglage, et rien d'autre", async () => {
    const view = await new GetCounterLateToleranceHandler(new FixedLateTolerance(15)).execute();

    expect(view).toEqual({ lateToleranceMinutes: 15 });
  });
});
