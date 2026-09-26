import { legacyShelfCodeOfSlug } from "../../catalog/domain/legacy-shelf-codes.js";
import type { ProductCatalogReader } from "../../catalog/domain/ports/product-catalog.reader.js";
import type { PricingSubjectType } from "../domain/pricing-act.js";

/** Les deux formes d'un sujet de limite de famille — pro, puis publique. */
const FAMILY_FLOOR_SUBJECT = /^(public:)?category:(.+)$/;

/**
 * **Les anciens noms d'un sujet du journal** — ceux qu'il portait avant que la
 * famille ne soit l'identifiant du référentiel.
 *
 * Une limite de famille a pour sujet `category:<famille>`. Jusqu'au 2026-09-26,
 * `<famille>` était un code de rayon (`category:viennoiserie`) ; la migration
 * `les_familles_se_lisent_en_donnees` a repris la limite, pas son journal, qui
 * est immuable. Sans ce pont, l'historique d'une limite s'arrêterait au jour
 * de la bascule.
 *
 * Le lien passe par le **slug** de la famille, le seul stable entre l'ancien
 * code et l'identifiant — et par `legacy-shelf-codes.ts`, seul lecteur des
 * anciens codes. Une famille sans article vivant n'a pas de slug connu ici :
 * son ancien fil ne se relie pas, ce qui n'arrive qu'à une famille qu'on ne
 * tarife plus.
 */
export async function legacyJournalSubjects(
  subjectType: PricingSubjectType,
  subjectId: string,
  catalog: ProductCatalogReader,
): Promise<readonly string[]> {
  const match = subjectType === "floor" ? FAMILY_FLOOR_SUBJECT.exec(subjectId) : null;
  const familyId = match?.[2];
  if (match === null || familyId === undefined) {
    return [];
  }
  const family = (await catalog.all()).find((item) => item.family?.id === familyId)?.family;
  const code = family === undefined || family === null ? null : legacyShelfCodeOfSlug(family.slug);
  return code === null ? [] : [`${match[1] ?? ""}category:${code}`];
}
