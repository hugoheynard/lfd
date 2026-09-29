import { z } from "zod";

import { fact, payload, subjectLabel } from "./fact.js";

const dims = (): z.ZodType =>
  z.object({ lengthCm: z.number().int(), widthCm: z.number().int(), heightCm: z.number().int() });
const spec = (): z.ZodType =>
  z.object({
    name: z.string().min(1),
    outer: dims(),
    inner: dims(),
    isotherm: z.boolean(),
    maxStack: z.number().int(),
    divisible: z.boolean(),
  });

/**
 * **Le catalogue des bacs et leurs contenances** (2026-09-29,
 * `documentation/livraisons/plan-preparation-de-tournee.md`, lot 4 bis, v2-1).
 *
 * Même famille que la flotte (« commandes et production »). Le sujet est le
 * type de bac, son libellé son nom ; une contenance porte le SKU (opaque) et
 * la valeur d'avant et d'après — vider une case efface la ligne, le journal
 * garde ce qu'elle valait.
 */
export const DELIVERY_BIN_FACTS = {
  "delivery_bin_type.added": fact(payload({ subjectLabel: subjectLabel(), bin: spec() })),
  "delivery_bin_type.corrected": fact(
    payload({ subjectLabel: subjectLabel(), before: spec(), after: spec() }),
  ),
  "delivery_bin_type.archived": fact(payload({ subjectLabel: subjectLabel(), bin: spec() })),
  "delivery_bin_type.reactivated": fact(payload({ subjectLabel: subjectLabel(), bin: spec() })),
  "delivery_bin_capacity.set": fact(
    payload({
      subjectLabel: subjectLabel(),
      sku: z.string().min(1),
      before: z.number().int().nullable(),
      after: z.number().int().nullable(),
    }),
  ),
} as const;
