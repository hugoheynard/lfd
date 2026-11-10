import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { customersCsv } from "../../domain/services/customers-csv.js";
import { AdminCompanyReader } from "../../domain/ports/admin-company.reader.js";
import { ExportCustomersCsvQuery } from "./export-customers-csv.query.js";

/**
 * L'export CSV du portefeuille client.
 *
 * Deux lignes ici, tout le format dans une fonction **pure** : c'est là qu'est
 * ce qui se trompe — un SIRET qu'un tableur lit en notation scientifique, un
 * point-virgule dans une raison sociale qui décale la ligne entière. Aucune de
 * ces pannes ne se voit à l'écran ; elles se voient dans le fichier, et un
 * fichier s'éprouve caractère par caractère.
 */
@QueryHandler(ExportCustomersCsvQuery)
export class ExportCustomersCsvHandler implements IQueryHandler<ExportCustomersCsvQuery, string> {
  constructor(private readonly companies: AdminCompanyReader) {}

  async execute(): Promise<string> {
    return customersCsv(await this.companies.listAll());
  }
}
