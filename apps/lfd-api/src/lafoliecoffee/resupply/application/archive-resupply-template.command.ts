/** Archiver un modèle : il quitte la bibliothèque, son nom redevient libre. */
export class ArchiveResupplyTemplateCommand {
  constructor(
    readonly templateId: string,
    readonly staffUserId: string,
  ) {}
}
