import { z } from "zod";

/** Le paramètre d'URL qui porte la clé — l'en-tête `X-Vitrine-Key` l'emporte s'il est là. */
export const VITRINE_KEY_QUERY = "key";

/** `?key=` : facultatif ; un tableau (`?key=a&key=b`) est refusé en 400. */
export const readKeyQuerySchema = z.string().optional();

/**
 * La clé de lecture d'une requête : l'en-tête `X-Vitrine-Key` d'abord, sinon
 * le paramètre `?key=`.
 *
 * Le paramètre existe parce que l'outil d'import de l'agence n'a qu'un champ
 * « clé » et ne pose pas d'en-tête (2026-10-21). Il ne protège pas moins : la
 * clé IDENTIFIE l'abonné, la vue est publique. La passerelle ne journalise que
 * le chemin, jamais la requête (`gateway/src/index.ts`, vérifié le
 * 2026-10-21).
 *
 * Les blancs autour sont retirés : une clé recopiée avec un retour à la ligne
 * est la même clé.
 */
export function readKeyOf(
  header: string | undefined,
  query: string | undefined,
): string | undefined {
  const fromHeader = header?.trim();
  if (fromHeader !== undefined && fromHeader !== "") {
    return fromHeader;
  }
  return query?.trim();
}
