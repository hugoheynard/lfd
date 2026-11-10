import type { VitrineSubscriberView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { VitrineSubscriberReader } from "../../domain/ports/vitrine-subscriber.reader.js";
import { ListVitrineSubscribersQuery } from "./list-vitrine-subscribers.query.js";

/** Les abonnés — jamais leur secret ni leur clé, qui ne se relisent pas. */
@QueryHandler(ListVitrineSubscribersQuery)
export class ListVitrineSubscribersHandler implements IQueryHandler<
  ListVitrineSubscribersQuery,
  readonly VitrineSubscriberView[]
> {
  constructor(private readonly subscribers: VitrineSubscriberReader) {}

  execute(): Promise<readonly VitrineSubscriberView[]> {
    return this.subscribers.list();
  }
}
