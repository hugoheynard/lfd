/**
 * **Lire le numéro `catalog-admin`** — le journal de l'écran Catalogue
 * (`public.catalog_admin_change`, `le-cache-du-back-office.md` § 4.3),
 * alimenté par les déclencheurs des tables que l'écran lit, jamais par le
 * code. Séparé du balayage (ISP).
 */
export abstract class CatalogAdminChangeVersionReader {
  /** Le numéro du journal (`journalVersion`), `0` s'il est vide. Comparé par égalité. */
  abstract versionOf(): Promise<number>;
}
