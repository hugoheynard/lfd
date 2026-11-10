import { addDays } from "@lfd/contracts";

import { InvalidFirstServiceDayError } from "../errors/first-service-day-errors.js";
import { firstServiceDayOf } from "../first-service-day.js";
import { admitsServiceDay, firstServiceDayFor } from "../order-admission.js";
import { OrderOpeningExemption } from "../order-opening-exemption.js";

/** Plan `plan-premier-jour-commandable.md` (2026-10-28) : la règle, pure. */

// `today` est une ENTRÉE de la règle, pas l'horloge : les jours se placent
// relativement à lui.
const TODAY = "2026-10-28";
const FIRST = addDays(TODAY, 2);
const STAMP = { at: new Date(0), author: { staffUserId: "s1", name: "Colette", role: "admin" } };
const OPEN = { ordersOpenToB2b: true, ordersOpenToB2c: true };
const PARTY = { companyId: "c1", email: "camille@visiteur.fr" };

const companyExemption = OrderOpeningExemption.grantToCompany({
  id: "x1",
  companyId: "c1",
  company: { name: "Chez Paul", status: "active" },
  active: [],
  stamp: STAMP,
});

function firstFor(
  opening: {
    readonly firstServiceDayB2b: string | null;
    readonly firstServiceDayB2c: string | null;
  },
  audience: "b2b" | "b2c" = "b2c",
  exemptions: readonly OrderOpeningExemption[] = [],
): string | null {
  return firstServiceDayFor({
    opening: { ...OPEN, ...opening },
    audience,
    exemptions,
    party: PARTY,
    today: TODAY,
  });
}

describe("admitsServiceDay", () => {
  it("refuse la veille du premier jour", () => {
    expect(admitsServiceDay(FIRST, addDays(FIRST, -1))).toBe(false);
  });

  it("admet le premier jour lui-même", () => {
    expect(admitsServiceDay(FIRST, FIRST)).toBe(true);
  });

  it("admet un jour suivant", () => {
    expect(admitsServiceDay(FIRST, addDays(FIRST, 7))).toBe(true);
  });

  it("sans premier jour, admet tout", () => {
    expect(admitsServiceDay(null, TODAY)).toBe(true);
  });
});

describe("firstServiceDayFor", () => {
  it("rend la date de SA clientèle, pas celle de l'autre", () => {
    const opening = { firstServiceDayB2b: addDays(TODAY, 5), firstServiceDayB2c: FIRST };

    expect(firstFor(opening, "b2c")).toBe(FIRST);
    expect(firstFor(opening, "b2b")).toBe(addDays(TODAY, 5));
  });

  it("sans date : null", () => {
    expect(firstFor({ firstServiceDayB2b: null, firstServiceDayB2c: null })).toBeNull();
  });

  it("une date passée ne restreint plus rien, sans qu'on ait à la vider", () => {
    expect(
      firstFor({ firstServiceDayB2b: null, firstServiceDayB2c: addDays(TODAY, -3) }),
    ).toBeNull();
  });

  it("une exemption qui couvre qui commande passe outre", () => {
    const opening = { firstServiceDayB2b: FIRST, firstServiceDayB2c: null };

    expect(firstFor(opening, "b2b", [companyExemption])).toBeNull();
  });
});

describe("firstServiceDayOf", () => {
  it("garde un jour du calendrier, et null pour « aucune »", () => {
    expect(firstServiceDayOf(FIRST)).toBe(FIRST);
    expect(firstServiceDayOf(null)).toBeNull();
  });

  it("refuse une forme autre que AAAA-MM-JJ, ou un jour qui n'existe pas", () => {
    expect(() => firstServiceDayOf("30/10/2026")).toThrow(InvalidFirstServiceDayError);
    expect(() => firstServiceDayOf("2026-02-30")).toThrow(InvalidFirstServiceDayError);
  });
});
