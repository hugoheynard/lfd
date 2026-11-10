/** Lit la photo lisible d'une note — celle qu'on ouvre en grand. */
export class GetClientNotePhotoQuery {
  constructor(
    readonly companyId: string,
    readonly noteId: string,
  ) {}
}
