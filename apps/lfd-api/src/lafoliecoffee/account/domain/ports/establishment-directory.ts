/**
 * Port **EstablishmentDirectory** — annuaire externe des établissements. Résout le
 * **code NAF** (activité principale) d'un **SIRET**. L'adaptateur concret interroge
 * l'API publique entreprises ; le résultat enrichit `Company.nafCode` (dimension
 * d'analyse commerciale). Rend `null` si le SIRET est introuvable ou l'appel échoue
 * — la résolution est **best-effort**, jamais bloquante pour la déclaration.
 */
export abstract class EstablishmentDirectory {
  abstract resolveNaf(siret: string): Promise<string | null>;
}
