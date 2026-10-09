/** Archiver un objet : il n'est plus proposé ni listé ; ses messages le gardent. */
export class ArchiveContactSubjectCommand {
  constructor(readonly subjectId: string) {}
}
