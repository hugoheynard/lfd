/** **Renommer et décrire** une formule — la section « présentation » de l'écran. */
export class EditBundlePresentationCommand {
  constructor(
    readonly key: string,
    readonly presentation: { readonly name: string; readonly description: string | null },
    readonly writtenBy: string | null,
  ) {}
}
