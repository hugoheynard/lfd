/** Archiver un numéro de contact : il n'est plus affiché ni listé. */
export class ArchiveContactPhoneCommand {
  constructor(readonly phoneId: string) {}
}
