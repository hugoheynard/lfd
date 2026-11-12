import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

import { DomainError } from "../../../platform/shared/errors/app-error.js";

/** L'en-tête qui porte la révision de la fiche lue par l'écran. */
export const EXPECTED_REVISION_HEADER = "if-match";

/** Un entier positif, guillemeté ou non (`"7"` comme une étiquette HTTP, ou `7`). */
const REVISION = /^"?(\d{1,9})"?$/u;

/** L'en-tête `If-Match` est présent mais ne dit pas une révision. */
export class MalformedExpectedRevisionError extends DomainError {
  constructor() {
    super(
      "account.company.revision_malformed",
      "La révision de la fiche envoyée (en-tête If-Match) n'est pas un nombre : rechargez la fiche, puis recommencez.",
    );
  }
}

/**
 * La révision attendue, ou `null` si l'appelant n'en envoie pas.
 *
 * Absente, rien n'est vérifié : seul l'écran de la fiche lit une révision, et
 * les autres appelants des mêmes routes n'en ont pas.
 *
 * @throws {MalformedExpectedRevisionError} l'en-tête ne dit pas un entier.
 */
export function parseExpectedRevision(header: string | string[] | undefined): number | null {
  if (header === undefined) {
    return null;
  }
  const match = typeof header === "string" ? REVISION.exec(header.trim()) : null;
  if (match?.[1] === undefined) {
    throw new MalformedExpectedRevisionError();
  }
  return Number(match[1]);
}

/**
 * Lit la **révision de la fiche** sur laquelle le geste a été décidé, dans
 * l'en-tête `If-Match` (`comptes-client/plan-fiche-perimee.md`). Le handler la
 * passe à `Company.ensureReadAt`.
 */
export const ExpectedRevision = createParamDecorator(
  (_data: unknown, context: ExecutionContext): number | null =>
    parseExpectedRevision(
      context.switchToHttp().getRequest<Request>().headers[EXPECTED_REVISION_HEADER],
    ),
);
