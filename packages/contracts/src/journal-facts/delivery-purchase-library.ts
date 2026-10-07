import { z } from "zod";

import { cents, count, fact, payload, subjectLabel } from "./fact.js";

/** Le plancher d'un véhicule candidat : en cm, toujours. */
const cargoDims = (): z.ZodType =>
  z.object({ lengthCm: z.number().int(), widthCm: z.number().int(), heightCm: z.number().int() });
/**
 * Les dimensions d'un bac candidat : en mm depuis le 2026-10-07, en cm entiers
 * avant. Un fait écrit ne se réécrit pas — les deux se lisent.
 */
const binDims = (): z.ZodType =>
  z.union([
    z.object({ lengthMm: z.number().int(), widthMm: z.number().int(), heightMm: z.number().int() }),
    cargoDims(),
  ]);
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
    cargo: cargoDims(),
    wheelArches: arches().nullable(),
    reference: text(),
    purchaseUrl: text(),
    priceCentsExclVat: cents().nullable(),
  });
const bin = (): z.ZodType =>
  z.object({
    name: z.string().min(1),
    outer: binDims(),
    inner: binDims(),
    isotherm: z.boolean(),
    maxStack: z.number().int(),
    supplier: text(),
    reference: text(),
    purchaseUrl: text(),
    unitPriceCentsExclVat: cents().nullable(),
  });

/**
 * **La bibliothèque d'achat** (2026-09-30,
 * `documentation/livraisons/chargement/plan-bibliotheque-d-achat.md`, lot B1).
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
  /**
   * **Les scénarios d'achat** (lot B3, 2026-10-01). La charge ne recopie pas
   * la sélection — des identifiants cités n'apprennent rien au journal ; le
   * nombre de véhicules et de formats suffit à reconnaître l'essai.
   */
  "delivery_purchase_scenario.created": fact(
    payload({ subjectLabel: subjectLabel(), vehicles: count(), formats: count() }),
  ),
  /** `renamedFrom` est l'ancien nom quand il a changé, `null` sinon. */
  "delivery_purchase_scenario.replaced": fact(
    payload({
      subjectLabel: subjectLabel(),
      renamedFrom: z.string().min(1).nullable(),
      vehicles: count(),
      formats: count(),
    }),
  ),
  "delivery_purchase_scenario.archived": fact(payload({ subjectLabel: subjectLabel() })),
  "delivery_purchase_scenario.reactivated": fact(payload({ subjectLabel: subjectLabel() })),
} as const;
