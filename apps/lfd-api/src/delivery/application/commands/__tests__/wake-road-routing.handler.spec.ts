import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { RoadRoutingWaker } from "../../../domain/ports/road-routing-waker.js";
import { WakeRoadRoutingCommand } from "../wake-road-routing.command.js";
import { WAKE_INTERVAL_MS, WakeRoadRoutingHandler } from "../wake-road-routing.handler.js";

/** Un réveil qui ne répond qu'à la demande : la commande ne doit pas l'attendre. */
class HeldWaker extends RoadRoutingWaker {
  calls = 0;
  private release: () => void = () => undefined;

  wake(): Promise<void> {
    this.calls += 1;
    return new Promise((resolve) => {
      this.release = resolve;
    });
  }

  answer(): void {
    this.release();
  }
}

function scene() {
  const waker = new HeldWaker();
  const clock = new FixedClock(new Date(0));
  const background = new BackgroundWork();
  const handler = new WakeRoadRoutingHandler(waker, clock, background);
  return { waker, clock, background, handler };
}

describe("WakeRoadRoutingHandler — le réveil à l'ouverture du Tour manager (2026-11-01)", () => {
  it("rend la main sans attendre la réponse du calcul routier, et l'appel est parti", async () => {
    const { waker, background, handler } = scene();

    await handler.execute(new WakeRoadRoutingCommand());

    expect(waker.calls).toBe(1);
    expect(background.snapshot().pending).toEqual(["delivery.road_routing_wake"]);
    waker.answer();
    await background.whenIdle();
  });

  it("ne réveille pas deux fois dans la minute : une ouverture répétée ne martèle pas", async () => {
    const { waker, clock, background, handler } = scene();

    await handler.execute(new WakeRoadRoutingCommand());
    clock.advanceMs(WAKE_INTERVAL_MS - 1);
    await handler.execute(new WakeRoadRoutingCommand());

    expect(waker.calls).toBe(1);
    waker.answer();
    await background.whenIdle();
  });

  it("réveille de nouveau une fois la minute passée", async () => {
    const { waker, clock, background, handler } = scene();

    await handler.execute(new WakeRoadRoutingCommand());
    waker.answer();
    clock.advanceMs(WAKE_INTERVAL_MS);
    await handler.execute(new WakeRoadRoutingCommand());

    expect(waker.calls).toBe(2);
    waker.answer();
    await background.whenIdle();
  });
});
