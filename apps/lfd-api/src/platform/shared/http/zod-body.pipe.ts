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
    return parseOrThrow(this.schema, value, "corps");
  }
}

/**
 * Même validation, appliquée à la **chaîne de requête**. Un pipe distinct plutôt
 * qu'un réemploi de {@link ZodBody} pour une seule raison : le message d'erreur.
 * « corps : limit » sur un paramètre d'URL enverrait chercher le problème dans
 * un corps qui n'existe pas.
 *
 * Les valeurs arrivant toujours en chaîne, les schémas de requête doivent
 * coercer eux-mêmes (`z.coerce.number()`).
 */
export class ZodQuery<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    return parseOrThrow(this.schema, value, "paramètre");
  }
}

/**
 * Même validation, appliquée à un **paramètre de chemin** nommé.
 *
 * Existe parce qu'un `schema.parse(param)` écrit dans le corps d'une route lève
 * un `ZodError` nu, que le filtre ne catégorise pas : un identifiant de fournée
 * mal formé sortait en 500 `internal.unexpected` (corrigé le 2026-10-22). Le
 * pipe le rend en 400 et nomme le paramètre fautif.
 */
export class ZodParam<T> implements PipeTransform<unknown, T> {
  constructor(
    private readonly schema: ZodType<T>,
    private readonly name: string,
  ) {}

  transform(value: unknown): T {
    return parseOrThrow(this.schema, value, this.name);
  }
}

/** Valide, ou lève une erreur qui dit OÙ chercher. */
function parseOrThrow<T>(schema: ZodType<T>, value: unknown, where: string): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new InvalidPayloadError(
      result.error.issues.map((issue) => `${issue.path.join(".") || where} : ${issue.message}`),
    );
  }

  return result.data;
}
