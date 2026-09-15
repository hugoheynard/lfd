/** Lit la vignette d'une note — la seule image que la liste charge. */
export class GetClientNoteThumbnailQuery {
  constructor(
    readonly companyId: string,
    readonly noteId: string,
  ) {}
}
