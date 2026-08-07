import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import type { ActivationView } from "../../domain/activation.js";
import { ActivationReader } from "../../domain/ports/activation.reader.js";
import { ListActivationsQuery } from "./list-activations.query.js";

/** Délègue au reader (projection du journal) — aucune logique propre. */
@QueryHandler(ListActivationsQuery)
export class ListActivationsHandler implements IQueryHandler<
  ListActivationsQuery,
  ActivationView[]
> {
  constructor(private readonly activations: ActivationReader) {}

  execute(): Promise<ActivationView[]> {
    return this.activations.list();
  }
}
