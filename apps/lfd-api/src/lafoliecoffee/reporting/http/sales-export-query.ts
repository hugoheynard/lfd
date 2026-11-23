import { z } from "zod";

/**
 * La **forme** de `GET /exports/sales` : deux bornes présentes, en chaîne. Que
 * ce soient des jours du calendrier, dans l'ordre, sur 31 jours au plus, c'est
 * `SalesPeriod` qui le refuse, avec ses mots — le contrôleur ne le revalide pas.
 */
export const salesExportQuerySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

export type SalesExportQueryParams = z.infer<typeof salesExportQuerySchema>;
