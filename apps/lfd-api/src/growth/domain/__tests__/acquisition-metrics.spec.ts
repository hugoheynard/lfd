import { type AcquisitionEvent, computeAcquisitionMetrics } from "../acquisition-metrics.js";

const NOW = new Date("2026-08-20T10:00:00.000Z");
const WINDOW = ["2026-08-18", "2026-08-19", "2026-08-20"];

function ev(type: string, subjectId: string, at: string): AcquisitionEvent {
  return { type, subjectId, occurredAt: new Date(at) };
}

describe("computeAcquisitionMetrics", () => {
  it("compte inscriptions, leads et résiliations par jour", () => {
    const events = [
      ev("user.registered", "u1", "2026-08-18T09:00:00.000Z"),
      ev("user.registered", "u2", "2026-08-18T18:00:00.000Z"),
      ev("lead.captured", "l1", "2026-08-19T09:00:00.000Z"),
    ];
    const view = computeAcquisitionMetrics(
      WINDOW,
      events,
      [new Date("2026-08-20T08:00:00.000Z")],
      NOW,
    );

    expect(view.registrations).toEqual([2, 0, 0]);
    expect(view.leads).toEqual([0, 1, 0]);
    expect(view.terminations).toEqual([0, 0, 1]);
  });

  it("ne compte qu'UNE 1re commande par personne, au jour de la plus ancienne", () => {
    const events = [
      ev("order.placed", "u1", "2026-08-19T10:00:00.000Z"),
      ev("order.placed", "u1", "2026-08-20T10:00:00.000Z"),
      ev("order.placed", "u2", "2026-08-20T11:00:00.000Z"),
    ];
    const view = computeAcquisitionMetrics(WINDOW, events, [], NOW);

    expect(view.firstOrders).toEqual([0, 1, 1]);
  });

  it("ignore ce qui tombe hors de la fenêtre", () => {
    const events = [ev("user.registered", "u9", "2026-01-01T10:00:00.000Z")];
    const view = computeAcquisitionMetrics(WINDOW, events, [], NOW);

    expect(view.registrations).toEqual([0, 0, 0]);
    expect(view.days).toEqual(WINDOW);
  });
});
