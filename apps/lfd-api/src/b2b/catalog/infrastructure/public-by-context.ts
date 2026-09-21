import type { PimContextPrice } from "../domain/entities/catalog-item.js";

/**
 * **Relit le prix public par contexte** depuis la colonne `jsonb`, en refusant
 * tout ce qui n'a pas la forme attendue.
 *
 * Jumelle d'`allergenLabelsOf`, et écrite pour la même raison : une colonne
 * `Json` est un **document**, et Prisma la rend en `unknown`. La relire sans la
 * vérifier reviendrait à faire confiance à ce qu'on a écrit il y a six mois,
 * sous une version du fil qui n'existe plus.
 *
 * ⚠️ **Une entrée mal formée est ÉCARTÉE, la carte n'est pas rejetée.** Le
 * contraire ferait perdre trois contextes justes à cause d'un quatrième — et un
 * article sans prix public se comporte comme un article d'avant la v9, ce qui
 * est le repli sûr. Une carte vide reste une carte vide : elle dit « aucun
 * contexte réglé », ce qui est exact.
 *
 * `null` dès que la colonne n'est pas un objet : c'est l'état des lignes
 * d'avant la v9, et il se lit « on ne sait pas », jamais « gratuit ».
 */
export function publicByContextOf(raw: unknown): Readonly<Record<string, PimContextPrice>> | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const byContext: Record<string, PimContextPrice> = {};
  for (const [key, value] of Object.entries(raw)) {
    const entry = priceOf(value);
    if (key.length > 0 && entry !== null) {
      byContext[key] = entry;
    }
  }
  return byContext;
}

/** Une entrée, ou `null` si elle ne porte pas ses deux nombres. */
function priceOf(value: unknown): PimContextPrice | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record: Record<string, unknown> = { ...value };
  const vatRatePercent = record["vatRatePercent"];
  const htMillicents = record["htMillicents"];
  // Les deux vont ensemble : un hors taxe sans son taux ne se facture pas, et
  // un taux seul n'est pas un prix. On ne garde donc jamais la moitié.
  if (
    typeof vatRatePercent !== "number" ||
    !Number.isFinite(vatRatePercent) ||
    vatRatePercent < 0 ||
    typeof htMillicents !== "number" ||
    !Number.isInteger(htMillicents) ||
    htMillicents < 0
  ) {
    return null;
  }
  return { vatRatePercent, htMillicents };
}
