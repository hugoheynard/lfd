import { isCalendarDay } from "../service-day.js";

describe("isCalendarDay", () => {
  it.each(["2030-03-12", "2028-02-29", "2030-12-31"])("accepte %s", (day) => {
    expect(isCalendarDay(day)).toBe(true);
  });

  it.each(["2030-02-29", "2030-13-01", "2030-00-10", "2030-04-31", "2030-3-12", "demain"])(
    "refuse %s",
    (day) => {
      expect(isCalendarDay(day)).toBe(false);
    },
  );
});
