import { addDays } from "@lfd/contracts";

import { PastClosedDayError } from "../../errors/production-settings-errors.js";
import { todayOf } from "../../../../day/index.js";
import { ServiceDay } from "../../../../day/index.js";
import { ProductionClosedDay } from "../production-closed-day.js";

const NOW = new Date();
const TODAY = todayOf(NOW);

function declare(day: string): ProductionClosedDay {
  return ProductionClosedDay.declare({
    serviceDay: ServiceDay.of(day),
    today: TODAY,
    declaredBy: "staff-1",
    declaredAt: NOW,
  });
}

describe("ProductionClosedDay — un jour sans production", () => {
  it("se pose aujourd'hui ou plus tard", () => {
    expect(declare(TODAY).serviceDay.value).toBe(TODAY);
    expect(declare(addDays(TODAY, 30)).declaredBy).toBe("staff-1");
  });

  it("refuse une date passée, en disant laquelle et quel jour on est", () => {
    const yesterday = addDays(TODAY, -1);

    expect(() => declare(yesterday)).toThrow(PastClosedDayError);
    expect(() => declare(yesterday)).toThrow(`Le ${yesterday} est passé (nous sommes le ${TODAY})`);
  });
});
