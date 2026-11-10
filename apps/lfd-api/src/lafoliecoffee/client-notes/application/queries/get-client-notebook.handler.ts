import type { ClientNotebookView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ClientNotebookReader } from "../../domain/ports/client-notebook.reader.js";
import { NotebookCompanies } from "../../domain/ports/notebook-companies.js";
import { ensureNotebookCompany } from "../services/notebook-company-guard.js";
import { GetClientNotebookQuery } from "./get-client-notebook.query.js";

/**
 * Sert le carnet d'un client. Un client inconnu est introuvable (404) plutôt
 * que servi comme un carnet vide : l'écran ne doit pas proposer d'écrire sur une
 * société qui n'existe pas.
 */
@QueryHandler(GetClientNotebookQuery)
export class GetClientNotebookHandler implements IQueryHandler<
  GetClientNotebookQuery,
  ClientNotebookView
> {
  constructor(
    private readonly companies: NotebookCompanies,
    private readonly notebooks: ClientNotebookReader,
  ) {}

  async execute(query: GetClientNotebookQuery): Promise<ClientNotebookView> {
    await ensureNotebookCompany(this.companies, query.companyId);
    return this.notebooks.read(query.companyId);
  }
}
