import type { CompanyMercuriale } from "../entities/company-mercuriale.js";

/**
 * **Les mercuriales en cours ou à venir**, tous clients confondus, avec leurs
 * avenants non rangés — ce qu'il faut pour dire « N mercuriales acceptent
 * cette promotion » (`plan-la-mercuriale-decide.md`, § 7). Closes et
 * terminées exclues : elles n'agissent plus.
 */
export abstract class UnendedMercurialesReader {
  abstract unendedAt(at: Date): Promise<readonly CompanyMercuriale[]>;
}
