import { clockTimeOf, minutesOfDay } from "../clock-time.js";

describe("l'heure de journée", () => {
  it("lit HH:MM en minutes depuis minuit", () => {
    expect(minutesOfDay("06:30")).toBe(390);
    expect(minutesOfDay("23:59")).toBe(1439);
  });

  it.each(["6:30", "24:00", "12:60", "midi", ""])("refuse « %s »", (value) => {
    expect(minutesOfDay(value)).toBeNull();
  });

  it("écrit des minutes en HH:MM, arrondies, en reprenant à minuit", () => {
    expect(clockTimeOf(390)).toBe("06:30");
    expect(clockTimeOf(390.6)).toBe("06:31");
    expect(clockTimeOf(24 * 60 + 40)).toBe("00:40");
  });
});
