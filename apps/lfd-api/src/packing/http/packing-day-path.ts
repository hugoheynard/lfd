import { productionPackingQuerySchema } from "@lfd/contracts";

import { ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";

const DAY_PATH = new ZodQuery(productionPackingQuerySchema);

/**
 * Le jour du chemin, validé dans sa FORME — un `400` qui nomme le paramètre.
 * (Un `parse` nu laissait une `ZodError` remonter en `500`, constaté le
 * 2026-10-05 sur `admin/packing/demain/board`.)
 */
export function packingDayOf(date: string): string {
  return DAY_PATH.transform({ date }).date;
}
