import { z } from "zod";

import type { Prisma } from "../../../platform/database/client/client.js";
import type { CatalogOperationFacts, OperationText } from "../domain/entities/catalog-operation.js";
import { CATALOG_OPERATION_AUDIENCES } from "../domain/operation-audience.js";

/**
 * **Les opérations photographiées par une version** — leur forme dans le
 * `jsonb` de `catalog_versions.operations` (fil v11, D10).
 *
 * Même règle d'évolution que les faits d'articles archivés : un champ ajouté
 * plus tard entre ici en `.optional()` avec un défaut, jamais en requis. Une
 * version est une archive perpétuelle ; la rendre illisible l'effacerait le
 * jour où l'on en a besoin.
 */
const textSchema = z.object({
  fr: z.string(),
  en: z.string().optional(),
  it: z.string().optional(),
});

const archivedOperationSchema = z.object({
  key: z.string(),
  name: textSchema,
  lede: textSchema.nullable(),
  image: z.object({ url: z.string(), alt: z.string() }).nullable(),
  announceFrom: z.coerce.date(),
  orderFrom: z.coerce.date().nullable(),
  orderUntil: z.coerce.date(),
  pickupFrom: z.string(),
  pickupUntil: z.string(),
  audience: z.enum(CATALOG_OPERATION_AUDIENCES),
  skus: z.array(z.string()),
  receivedAt: z.coerce.date(),
});

const archivedOperationsSchema = z.array(archivedOperationSchema).nullable();

/** La colonne relue ; `null` = version d'avant la v11, jamais « aucune opération ». */
export function readArchivedOperations(raw: unknown): readonly CatalogOperationFacts[] | null {
  const parsed = archivedOperationsSchema.parse(raw);
  return parsed === null ? null : parsed.map(toFacts);
}

/** La colonne à écrire — les instants en ISO, explicitement. */
export function archivedOperationsJson(
  operations: readonly CatalogOperationFacts[],
): Prisma.InputJsonArray {
  return operations.map((operation) => ({
    key: operation.key,
    name: { ...operation.name },
    lede: operation.lede === null ? null : { ...operation.lede },
    image: operation.image === null ? null : { ...operation.image },
    announceFrom: operation.announceFrom.toISOString(),
    orderFrom: operation.orderFrom === null ? null : operation.orderFrom.toISOString(),
    orderUntil: operation.orderUntil.toISOString(),
    pickupFrom: operation.pickupFrom,
    pickupUntil: operation.pickupUntil,
    audience: operation.audience,
    skus: [...operation.skus],
    receivedAt: operation.receivedAt.toISOString(),
  }));
}

function toFacts(row: z.infer<typeof archivedOperationSchema>): CatalogOperationFacts {
  return {
    ...row,
    name: operationText(row.name),
    lede: row.lede === null ? null : operationText(row.lede),
  };
}

/**
 * Un texte relu, **langues présentes seulement** : une clé `en: undefined`
 * se compterait comme une traduction (`exactOptionalPropertyTypes`).
 */
export function operationText(raw: {
  readonly fr: string;
  readonly en?: string | undefined;
  readonly it?: string | undefined;
}): OperationText {
  return {
    fr: raw.fr,
    ...(raw.en === undefined ? {} : { en: raw.en }),
    ...(raw.it === undefined ? {} : { it: raw.it }),
  };
}
