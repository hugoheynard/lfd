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

/** La société d'un carnet, telle qu'un fait la cite : son id et son nom du moment. */
export interface NotebookCompany {
  readonly id: string;
  readonly name: string;
}

/**
 * La société, **nommée** pour le journal (lot B du plan des phrases).
 *
 * @throws {ClientNotebookCompanyNotFoundError} aucune société sous cet identifiant.
 */
export async function namedNotebookCompany(
  companies: NotebookCompanies,
  companyId: string,
): Promise<NotebookCompany> {
  const name = await companies.nameOf(companyId);
  if (name === null) {
    throw new ClientNotebookCompanyNotFoundError(companyId);
  }
  return { id: companyId, name };
}
