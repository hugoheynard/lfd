import type { ContactSubjectView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ContactSubjectReader } from "../../domain/ports/contact-subject.reader.js";
import { ListContactSubjectsQuery } from "./list-contact-subjects.query.js";

/** Sert les objets au back-office, adresses de destination comprises. Lecture pure. */
@QueryHandler(ListContactSubjectsQuery)
export class ListContactSubjectsHandler implements IQueryHandler<
  ListContactSubjectsQuery,
  ContactSubjectView[]
> {
  constructor(private readonly subjects: ContactSubjectReader) {}

  execute(): Promise<ContactSubjectView[]> {
    return this.subjects.list();
  }
}
