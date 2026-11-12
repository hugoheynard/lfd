/**
 * **Lire le numéro `companies`** — le journal des comptes clients
 * (`public.company_change`, `plan-veilleur-unique.md` § 3.2), alimenté par
 * les déclencheurs des tables que la liste et la fiche des sociétés lisent,
 * jamais par le code. Séparé du balayage (ISP).
 *
 * Aucun mur tenant : le journal ne porte aucune société, seulement « quelque
 * chose a été écrit » ; la porte est gardée par `b2b_companies:read`.
 */
export abstract class CompanyChangeVersionReader {
  /** Le numéro du journal (`journalVersion`), `0` s'il est vide. Comparé par égalité. */
  abstract versionOf(): Promise<number>;
}
