import type { PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

import { DomainError } from "../errors/app-error.js";

export class InvalidPayloadError extends DomainError {
  constructor(readonly details: readonly string[]) {
    super("http.payload.invalid", `Requête invalide : ${details.join(" · ")}`);
  }
}

/**
 * Validation de la charge utile à la **frontière** (mirroir du PIM).
 *
 * Elle ne remplace pas les invariants du domaine — les value objects se protègent
 * eux-mêmes, quel que soit le chemin d'entrée (HTTP, seed, cron). Elle rend juste
 * l'erreur lisible avant qu'une requête manifestement mal formée n'atteigne un
 * handler.
 */
export class ZodBody<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new InvalidPayloadError(
        result.error.issues.map((issue) => `${issue.path.join(".") || "corps"} : ${issue.message}`),
      );
    }

    return result.data;
  }
}
