import { isRoundsDayContent } from "../rounds-day-content.js";

describe("isRoundsDayContent", () => {
  const composition = { day: "2030-03-12", rounds: [], ofDay: [] };

  it("reconnaît une composition rangée et ses signalements", () => {
    expect(isRoundsDayContent({ composition, incidents: [] })).toBe(true);
  });

  it("refuse une forme inattendue — relue en base", () => {
    expect(isRoundsDayContent(null)).toBe(false);
    expect(isRoundsDayContent({ composition })).toBe(false);
    expect(
      isRoundsDayContent({ composition: { day: "2030-03-12", rounds: [] }, incidents: [] }),
    ).toBe(false);
    // Une vue servie n'est pas un contenu : elle porterait des livreurs lus.
    expect(
      isRoundsDayContent({ day: "2030-03-12", rounds: [], unassigned: [], incidents: [] }),
    ).toBe(false);
  });
});
