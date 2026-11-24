import { RoadRoutingReadiness } from "../../../domain/ports/road-routing-readiness.js";
import { GetRoadRoutingReadinessHandler } from "../get-road-routing-readiness.handler.js";
import { GetRoadRoutingReadinessQuery } from "../get-road-routing-readiness.query.js";

class StubReadiness extends RoadRoutingReadiness {
  calls = 0;

  constructor(private readonly ready: boolean) {
    super();
  }

  isReady(): Promise<boolean> {
    this.calls += 1;
    return Promise.resolve(this.ready);
  }
}

describe("GetRoadRoutingReadinessHandler — le sondage de Tour manager", () => {
  it.each([true, false])("rend { ready: %s } d'un seul sondage", async (ready) => {
    const readiness = new StubReadiness(ready);

    const view = await new GetRoadRoutingReadinessHandler(readiness).execute(
      new GetRoadRoutingReadinessQuery(),
    );

    expect(view).toEqual({ ready });
    expect(readiness.calls).toBe(1);
  });
});
