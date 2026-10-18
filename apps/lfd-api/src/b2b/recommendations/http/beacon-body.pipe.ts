import type { PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

import { InvalidPayloadError, ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";

/**
 * Le corps d'un **`navigator.sendBeacon`** : du JSON envoyé en `text/plain`.
 *
 * Un balisage part à `pagehide`, sans réponse attendue, et sans pré-vol CORS —
 * il n'a donc droit qu'à un type « simple ». La boutique sert sa mesure en
 * `text/plain` ; le même corps peut aussi arriver en JSON. Une fois relu, il
 * passe par la même validation de forme que n'importe quel corps.
 */
export class BeaconBody<T> implements PipeTransform<unknown, T> {
  private readonly json: ZodBody<T>;

  constructor(schema: ZodType<T>) {
    this.json = new ZodBody(schema);
  }

  transform(value: unknown): T {
    return this.json.transform(typeof value === "string" ? parsed(value) : value);
  }
}

function parsed(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new InvalidPayloadError(["corps : JSON illisible"]);
  }
}
