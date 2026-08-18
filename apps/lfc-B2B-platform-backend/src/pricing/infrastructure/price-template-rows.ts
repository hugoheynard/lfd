import { templateLineSchema, type PriceTemplateKind } from "@lfd/contracts";
import { z } from "zod";

import { CorruptedPriceTemplateError } from "../domain/pricing-errors.js";
import type { PriceTemplateState, TemplateLine } from "../domain/entities/price-template.js";

export interface TemplateRow {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly lines: unknown;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
}

const KINDS: readonly PriceTemplateKind[] = ["mercuriale", "devis"];

/**
 * Les lignes sont écrites en JSON par une version du code et relues par une
 * autre : le schéma est la seule barrière entre les deux. Un gabarit illisible
 * **lève** plutôt que d'être rendu vide — vide, il serait posé chez un client
 * comme une grille sans contenu.
 */
const linesSchema = z.array(templateLineSchema).min(1);

export function templateStateFromRow(row: TemplateRow): PriceTemplateState {
  const kind = KINDS.find((candidate) => candidate === row.kind);
  if (kind === undefined) {
    throw new CorruptedPriceTemplateError(row.id, `nature inattendue « ${row.kind} »`);
  }
  const lines = linesSchema.safeParse(row.lines);
  if (!lines.success) {
    throw new CorruptedPriceTemplateError(row.id, "lignes illisibles");
  }
  return {
    id: row.id,
    kind,
    label: row.label,
    lines: lines.data.map((line): TemplateLine => ({
      sku: line.sku,
      tiers: line.tiers,
      // Absent des gabarits écrits avant ce champ : le schéma le pose à `null`.
      plannedVolume: line.plannedVolume,
    })),
    createdBy: row.createdBy,
    archivedAt: row.archivedAt,
  };
}
