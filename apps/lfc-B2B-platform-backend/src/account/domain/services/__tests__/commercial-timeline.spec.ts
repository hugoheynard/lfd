import { commercialTimeline, type RawTimelineEntry } from "../commercial-timeline.js";

function entry(type: string, isoDate: string, id = `${type}-${isoDate}`): RawTimelineEntry {
  return { id, type, occurredAt: new Date(isoDate), actorType: "customer" };
}

describe("commercialTimeline", () => {
  it("rend du plus RÉCENT au plus ancien, quel que soit l'ordre reçu", () => {
    const timeline = commercialTimeline([
      entry("order.placed", "2026-03-01T10:00:00.000Z"),
      entry("company.declared", "2026-01-01T10:00:00.000Z"),
    ]);
    expect(timeline.map((e) => e.type)).toEqual(["order.placed", "company.declared"]);
  });

  it("rattache au rendez-vous honoré le premier jalon qui suit, avec son délai", () => {
    const timeline = commercialTimeline([
      entry("appointment.honored", "2026-03-01T10:00:00.000Z"),
      entry("company.activated", "2026-03-04T10:00:00.000Z"),
    ]);
    const rdv = timeline.find((e) => e.type === "appointment.honored");
    expect(rdv?.outcome).toEqual({ type: "company.activated", days: 3 });
  });

  it("prend le PREMIER jalon, pas le plus flatteur", () => {
    // Sinon l'historique dirait ce qu'on a envie d'entendre.
    const timeline = commercialTimeline([
      entry("appointment.honored", "2026-03-01T10:00:00.000Z"),
      entry("order.placed", "2026-03-02T10:00:00.000Z"),
      entry("subscription.created", "2026-03-10T10:00:00.000Z"),
    ]);
    expect(timeline.find((e) => e.type === "appointment.honored")?.outcome?.type).toBe(
      "order.placed",
    );
  });

  it("n'attribue RIEN à ce qui précède le rendez-vous", () => {
    const timeline = commercialTimeline([
      entry("order.placed", "2026-02-01T10:00:00.000Z"),
      entry("appointment.honored", "2026-03-01T10:00:00.000Z"),
    ]);
    expect(timeline.find((e) => e.type === "appointment.honored")?.outcome).toBeNull();
  });

  it("n'attribue rien au-delà de la fenêtre — deux mois après, ce n'est plus « suite à »", () => {
    const timeline = commercialTimeline([
      entry("appointment.honored", "2026-03-01T10:00:00.000Z"),
      entry("order.placed", "2026-06-01T10:00:00.000Z"),
    ]);
    expect(timeline.find((e) => e.type === "appointment.honored")?.outcome).toBeNull();
  });

  it("ne cherche une suite qu'aux rendez-vous qui ont EU LIEU", () => {
    const timeline = commercialTimeline([
      entry("appointment.cancelled", "2026-03-01T10:00:00.000Z"),
      entry("order.placed", "2026-03-02T10:00:00.000Z"),
    ]);
    expect(timeline.find((e) => e.type === "appointment.cancelled")?.outcome).toBeNull();
  });

  it("laisse `null` quand rien n'a suivi — c'est une information, pas un trou", () => {
    const timeline = commercialTimeline([entry("appointment.honored", "2026-03-01T10:00:00.000Z")]);
    expect(timeline[0]?.outcome).toBeNull();
  });
});
