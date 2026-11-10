import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import {
  PendingAccessReader,
  type PendingAccessView,
} from "../../domain/ports/pending-access.reader.js";
import { ListPendingAccessQuery } from "./list-pending-access.query.js";

/** Rend la file telle que le reader la lit — aucune règle à ajouter ici. */
@QueryHandler(ListPendingAccessQuery)
export class ListPendingAccessHandler implements IQueryHandler<
  ListPendingAccessQuery,
  readonly PendingAccessView[]
> {
  constructor(private readonly pending: PendingAccessReader) {}

  execute(): Promise<readonly PendingAccessView[]> {
    return this.pending.list();
  }
}
