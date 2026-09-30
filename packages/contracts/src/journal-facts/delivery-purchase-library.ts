import { z } from "zod";

import { cents, fact, payload, subjectLabel } from "./fact.js";

const dims = (): z.ZodType =>
  z.object({ lengthCm: z.number().int(), widthCm: z.number().int(), heightCm: z.number().int() });
const arches = (): z.ZodType =>
  z.object({
    lengthCm: z.number().int(),
    protrusionCm: z.number().int(),
    fromBackCm: z.number().int(),
    heightCm: z.number().int(),
  });
const text = (): z.ZodType => z.string().min(1).nullable();

const vehicle = (): z.ZodType =>
  z.object({
    name: z.string().min(1),
    cargo: dims(),
    wheelArches: arches().nullable(),
    reference: text(),
    purchaseUrl: text(),
    priceCentsExclVat: cents().nullable(),
  });
const bin = (): z.ZodType =>
  z.object({
    name: z.string().min(1),
    outer: dims(),
    inner: dims(),
    isotherm: z.boolean(),
    maxStack: z.number().int(),
    supplier: text(),
    reference: text(),
    purchaseUrl: text(),
    unitPriceCentsExclVat: cents().nullable(),
  });

/**
 * **La bibliothèque d'achat** (2026-09-30,
 * `documentation/livraisons/plan-bibliotheque-d-achat.md`, lot B1).
 *
 * Même famille que la flotte et les bacs (« commandes et production »). Le
 * sujet est le candidat, son libellé son nom. Le prix HT y figure parce qu'il
 * fait partie de la fiche qu'on corrige — c'est un prix de catalogue, pas un
 * fait d'argent : aucune facture, aucune écriture comptable ne le lit (B-D3).
 */
export const DELIVERY_PURCHASE_LIBRARY_FACTS = {
  "delivery_purchase_vehicle_candidate.declared": fact(
    payload({ subjectLabel: subjectLabel(), candidate: vehicle() }),
  ),
  "delivery_purchase_vehicle_candidate.corrected": fact(
    payload({ subjectLabel: subjectLabel(), before: vehicle(), after: vehicle() }),
  ),
  "delivery_purchase_vehicle_candidate.archived": fact(
    payload({ subjectLabel: subjectLabel(), candidate: vehicle() }),
  ),
  "delivery_purchase_vehicle_candidate.reactivated": fact(
    payload({ subjectLabel: subjectLabel(), candidate: vehicle() }),
  ),
  "delivery_purchase_bin_candidate.declared": fact(
    payload({ subjectLabel: subjectLabel(), candidate: bin() }),
  ),
  "delivery_purchase_bin_candidate.corrected": fact(
    payload({ subjectLabel: subjectLabel(), before: bin(), after: bin() }),
  ),
  "delivery_purchase_bin_candidate.archived": fact(
    payload({ subjectLabel: subjectLabel(), candidate: bin() }),
  ),
  "delivery_purchase_bin_candidate.reactivated": fact(
    payload({ subjectLabel: subjectLabel(), candidate: bin() }),
  ),
} as const;
