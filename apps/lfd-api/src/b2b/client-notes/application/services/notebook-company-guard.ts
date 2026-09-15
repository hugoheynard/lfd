import { ClientNotebookCompanyNotFoundError } from "../../domain/errors/client-notebook-errors.js";
import type { NotebookCompanies } from "../../domain/ports/notebook-companies.js";

/**
 * Refuse une société absente — AVANT tout geste de stockage côté écriture, et
 * avant de servir un carnet vide côté lecture. Partagée par les deux côtés, donc
 * ni dans un handler d'écriture ni dans un de lecture.
 *
 * @throws {ClientNotebookCompanyNotFoundError} aucune société sous cet identifiant.
 */
export async function ensureNotebookCompany(
  companies: NotebookCompanies,
  companyId: string,
): Promise<void> {
  if (!(await companies.exists(companyId))) {
    throw new ClientNotebookCompanyNotFoundError(companyId);
  }
}
