import {
  deadlineListSchema,
  deadlinesFor,
  deliverySlotSchema,
  deliverySpecsSchema,
} from "../address.js";
import { deliveryAvailabilityPatchSchema } from "../delivery-availability.js";

const SPECS = {
  note: "",
  slots: { mode: "everyday", slot: { start: "06:00", end: "08:00" } },
  deliveryContact: null,
  gps: null,
};

describe("créneau ou échéance — contrats (CA-D2)", () => {
  it("un créneau préféré garde son début : l'échéance a sa liste", () => {
    expect(deliverySlotSchema.safeParse({ start: null, end: "06:00" }).success).toBe(false);
  });

  it("une adresse rangée sans mode ni échéances reste lisible", () => {
    const specs = deliverySpecsSchema.parse(SPECS);
    expect(specs.windowMode).toBeUndefined();
    expect(specs.deadlines).toBeUndefined();
  });

  it("une adresse porte son mode et plusieurs échéances", () => {
    const specs = deliverySpecsSchema.parse({
      ...SPECS,
      windowMode: "deadline",
      deadlines: { mode: "everyday", times: ["06:00", "11:00"] },
    });
    expect(specs.windowMode).toBe("deadline");
    expect(deadlinesFor(specs.deadlines, "mon")).toEqual(["06:00", "11:00"]);
  });

  it("refuse une liste d'échéances vide, en doublon ou en désordre", () => {
    expect(deadlineListSchema.safeParse([]).success).toBe(false);
    expect(deadlineListSchema.safeParse(["06:00", "06:00"]).success).toBe(false);
    expect(deadlineListSchema.safeParse(["11:00", "06:00"]).success).toBe(false);
  });

  it("des échéances par jour se lisent pour le jour servi", () => {
    const byDay = {
      mode: "perDay" as const,
      byDay: { mon: ["06:00"], tue: null, wed: null, thu: null, fri: null, sat: null, sun: null },
    };
    expect(deadlinesFor(byDay, "mon")).toEqual(["06:00"]);
    expect(deadlinesFor(byDay, "tue")).toEqual([]);
    expect(deadlinesFor(byDay, null)).toEqual([]);
  });

  it("le réglage global se patche par le seul mode", () => {
    expect(deliveryAvailabilityPatchSchema.safeParse({ windowMode: "deadline" }).success).toBe(
      true,
    );
    expect(deliveryAvailabilityPatchSchema.safeParse({}).success).toBe(false);
  });
});
