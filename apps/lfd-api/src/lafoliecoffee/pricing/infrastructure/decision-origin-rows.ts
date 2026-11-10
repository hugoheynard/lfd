import type { Prisma } from "../../../platform/database/client/client.js";
import type { DecisionOrigin } from "../domain/entities/decision-carry-over.js";

/**
 * **L'origine d'une décision reportée, ligne ↔ domaine** — la colonne
 * `origin jsonb` des quatre tables datées (`plan-report-apres-detachement.md`,
 * R0). Écrite une fois, ici : une origine illisible LÈVE plutôt que d'être
 * prise pour une saisie — « déjà reporté » se juge sur elle.
 */
export function decisionOriginFromJson(
  value: unknown,
  refuse: (why: string) => Error,
): DecisionOrigin | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "object") {
    throw refuse("l'origine d'un report n'est pas un objet");
  }
  const origin: Record<string, unknown> = { ...value };
  const { kind, fromSku, fromDecisionId } = origin;
  if (kind !== "detached" || typeof fromSku !== "string" || typeof fromDecisionId !== "string") {
    throw refuse("l'origine d'un report n'a pas la forme attendue");
  }
  return { kind, fromSku, fromDecisionId };
}

/**
 * La colonne à écrire : rien pour une saisie (la colonne reste `NULL`),
 * l'origine champ par champ pour un report — jamais l'objet du domaine tel
 * quel, dont un champ ajouté partirait en base sans relecture.
 */
export function originColumn(origin: DecisionOrigin | null): {
  readonly origin?: Prisma.InputJsonValue;
} {
  return origin === null
    ? {}
    : {
        origin: {
          kind: origin.kind,
          fromSku: origin.fromSku,
          fromDecisionId: origin.fromDecisionId,
        },
      };
}
