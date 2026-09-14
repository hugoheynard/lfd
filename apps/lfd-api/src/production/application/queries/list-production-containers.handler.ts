import type { ProductionContainerView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ProductionContainerReader } from "../../domain/ports/production-container.reader.js";
import { ListProductionContainersQuery } from "./list-production-containers.query.js";

/**
 * La liste des réglages, triée par SKU.
 *
 * Elle passe par le port de LECTURE, pas par celui d'écriture : c'est l'ISP, et
 * c'est aussi ce qui garantit qu'une lecture ne peut rien muter — il n'y a rien
 * à appeler pour ça sur ce port.
 *
 * Le tri est fait ici et non en base : la carte du port est indexée par SKU, et
 * un écran de paramétrage qui rendrait ses lignes dans un ordre différent à
 * chaque ouverture se relirait en entier à chaque fois.
 */
@QueryHandler(ListProductionContainersQuery)
export class ListProductionContainersHandler implements IQueryHandler<
  ListProductionContainersQuery,
  readonly ProductionContainerView[]
> {
  constructor(private readonly containers: ProductionContainerReader) {}

  async execute(): Promise<readonly ProductionContainerView[]> {
    const rules = await this.containers.allBySku();
    return [...rules.entries()]
      .map(([sku, rule]) => ({ sku, ...rule }))
      .sort((left, right) => left.sku.localeCompare(right.sku));
  }
}
