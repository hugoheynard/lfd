/** Archiver un motif : il n'est plus proposé, les demandes reçues le gardent. */
export class ArchiveRequestReasonCommand {
  constructor(readonly reasonId: string) {}
}
