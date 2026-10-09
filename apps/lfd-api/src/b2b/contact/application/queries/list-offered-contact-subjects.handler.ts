import type { PublicContactSubjectView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ContactSubjectReader } from "../../domain/ports/contact-subject.reader.js";
import { ListOfferedContactSubjectsQuery } from "./list-offered-contact-subjects.query.js";

/** Sert à la boutique les objets actifs de ce public, sans leur adresse. Lecture pure. */
@QueryHandler(ListOfferedContactSubjectsQuery)
export class ListOfferedContactSubjectsHandler implements IQueryHandler<
  ListOfferedContactSubjectsQuery,
  PublicContactSubjectView[]
> {
  constructor(private readonly subjects: ContactSubjectReader) {}

  execute(query: ListOfferedContactSubjectsQuery): Promise<PublicContactSubjectView[]> {
    return this.subjects.offeredTo(query.audience);
  }
}
