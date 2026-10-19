import { Bundle } from "../bundle.js";
import type { BundleRecord, CreateBundle } from "../bundle-shapes.js";

/** Les instants ne sont comparés qu'entre eux, jamais à l'horloge. */
export const CREATED_AT = new Date("2026-10-19T08:00:00.000Z");
export const LATER = new Date("2026-10-19T09:00:00.000Z");

/** Le petit déjeuner du plan (§0) : douceur, pain, boisson. */
export function breakfast(over: Partial<CreateBundle> = {}): CreateBundle {
  return {
    id: "bundle_1",
    name: "Petit déjeuner",
    description: "Une douceur, une baguette, une boisson.",
    audience: "public",
    groups: [
      { label: "Douceur", choices: ["VIE-001-1", "VIE-002-1"] },
      { label: "Baguette", choices: ["PAI-001-1"] },
      { label: "Boisson", choices: ["BOI-001-1", "BOI-002-1"] },
    ],
    ...over,
  };
}

export function createdBreakfast(over: Partial<CreateBundle> = {}): Bundle {
  return Bundle.create(breakfast(over), { by: "staff_1", at: CREATED_AT });
}

/** La formule telle que la base la rendrait. */
export function recordOf(bundle: Bundle): BundleRecord {
  return { ...bundle.snapshot() };
}
