import { z } from "zod";

import { ZodParam } from "../../../platform/shared/http/zod-body.pipe.js";

/**
 * Un article dans le chemin (`:sku`) : non vide une fois rogné. Lu sans
 * validation, un `%20` atteignait le domaine et revenait en « article
 * introuvable » au lieu d'un 400 qui nomme le paramètre (audit du réassort,
 * 2026-11-02).
 */
export function skuParam(): ZodParam<string> {
  return new ZodParam(z.string().trim().min(1), "sku");
}
