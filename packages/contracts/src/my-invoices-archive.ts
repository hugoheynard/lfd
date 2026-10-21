import { z } from "zod";

/**
 * **Le zip de « Mes factures »** — `GET companies/:companyId/invoices.zip`
 * (plan `documentation/comptabilite/facturation/plan-page-mes-factures.md`,
 * lot P2, §7.5). La FORME de la chaîne de requête seulement : le plafond de
 * pièces, la visibilité et le rendu des PDF sont des règles du serveur.
 *
 * Deux façons de désigner les pièces, jamais les deux :
 *
 * - les filtres de la liste (`year`, `month`, `kind`) — « tout ce qui est
 *   filtré » ; aucun filtre = toutes les pièces visibles ;
 * - `ids`, une liste d'identifiants séparés par des virgules — la sélection.
 */

/** Un identifiant de pièce : opaque, sans virgule ni espace. */
const INVOICE_ID = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "identifiant de pièce invalide");

const idsSchema = z
  .string()
  .transform((raw) => raw.split(","))
  .pipe(z.array(INVOICE_ID).min(1));

export const myInvoicesArchiveQuerySchema = z
  .object({
    year: z.coerce.number().int().positive().optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    kind: z.enum(["invoice", "credit_note"]).optional(),
    ids: idsSchema.optional(),
  })
  .refine((query) => query.month === undefined || query.year !== undefined, {
    message: "un mois se choisit avec son année",
    path: ["month"],
  })
  .refine(
    (query) =>
      query.ids === undefined ||
      (query.year === undefined && query.month === undefined && query.kind === undefined),
    {
      message: "une sélection (ids) ou des filtres (year, month, kind), jamais les deux",
      path: ["ids"],
    },
  );
export type MyInvoicesArchiveQuery = z.infer<typeof myInvoicesArchiveQuerySchema>;
