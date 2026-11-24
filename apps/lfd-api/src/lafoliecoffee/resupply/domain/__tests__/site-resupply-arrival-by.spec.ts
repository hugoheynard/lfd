import {
  ResupplyArrivalOnAsapError,
  ResupplyArrivalRequiredError,
} from "../resupply-arrival-errors.js";
import { ResupplyArrivalTime } from "../resupply-arrival-time.js";
import { UNGATED_PLACEMENT } from "../site-resupply-checks.js";
import { ResupplyAlreadyPlacedError } from "../site-resupply-errors.js";
import { SiteResupply } from "../site-resupply.js";
import { EVENING, line, MORNING_ARRIVAL, trace } from "./site-resupply-fixtures.js";

function bare(target: "tomorrow" | "asap"): SiteResupply {
  const resupply = SiteResupply.draft({ id: "rs1", siteId: "site_1", target, at: EVENING });
  resupply.addLine(line("CRO", 6));
  return resupply;
}

describe("SiteResupply — l'heure d'arrivée voulue (H1, H-D2)", () => {
  it("« pour demain » ne part pas sans heure, et reste en cours", () => {
    const resupply = bare("tomorrow");

    expect(() => resupply.place(trace(EVENING), UNGATED_PLACEMENT)).toThrow(
      ResupplyArrivalRequiredError,
    );
    expect(() => resupply.place(trace(EVENING), UNGATED_PLACEMENT)).toThrow(/pour quelle heure/u);
    expect(resupply.status).toBe("draft");
  });

  it("« pour demain » part avec son heure, qu'il garde", () => {
    const resupply = bare("tomorrow");
    resupply.setArrivalBy(MORNING_ARRIVAL);

    resupply.place(trace(EVENING), UNGATED_PLACEMENT);

    expect(resupply.status).toBe("placed");
    expect(resupply.arrivalBy?.value).toBe("06:30");
  });

  it("« au plus tôt » refuse une heure dès qu'on la pose, et part sans", () => {
    const resupply = bare("asap");

    expect(() => resupply.setArrivalBy(ResupplyArrivalTime.of("06:30"))).toThrow(
      ResupplyArrivalOnAsapError,
    );
    resupply.place(trace(EVENING), UNGATED_PLACEMENT);
    expect(resupply.arrivalBy).toBeNull();
  });

  it("l'heure se change et se retire tant que la demande est en cours, plus une fois envoyée", () => {
    const resupply = bare("tomorrow");
    resupply.setArrivalBy(ResupplyArrivalTime.of("05:00"));
    resupply.setArrivalBy(null);
    expect(resupply.arrivalBy).toBeNull();
    resupply.setArrivalBy(MORNING_ARRIVAL);
    resupply.place(trace(EVENING), UNGATED_PLACEMENT);

    expect(() => resupply.setArrivalBy(ResupplyArrivalTime.of("13:00"))).toThrow(
      ResupplyAlreadyPlacedError,
    );
    expect(resupply.arrivalBy?.value).toBe("06:30");
  });

  it("le fournil suit la même règle à son envoi d'un geste", () => {
    const send = (target: "tomorrow" | "asap", arrivalBy: ResupplyArrivalTime | null) =>
      SiteResupply.sentByBakehouse({
        id: "rs2",
        siteId: "site_1",
        target,
        name: null,
        arrivalBy,
        lines: [line("CRO", 1)],
        trace: trace(EVENING),
        deadline: null,
        planStopped: false,
      });

    expect(() => send("tomorrow", null)).toThrow(ResupplyArrivalRequiredError);
    expect(() => send("asap", MORNING_ARRIVAL)).toThrow(ResupplyArrivalOnAsapError);
    expect(send("tomorrow", MORNING_ARRIVAL).arrivalBy?.value).toBe("06:30");
  });

  it("un réassort envoyé avant l'heure se relit sans heure", () => {
    const restored = SiteResupply.restore({
      id: "rs_old",
      siteId: "site_1",
      target: "tomorrow",
      serviceDay: "2026-01-03",
      version: 2,
      origin: "counter",
      name: null,
      lines: [{ sku: "CRO", label: "Article CRO", quantity: 3, saleUnit: "piece" }],
      placed: trace(EVENING),
      cancelled: null,
      arrived: null,
    });

    expect(restored.arrivalBy).toBeNull();
    expect(restored.status).toBe("placed");
  });
});
