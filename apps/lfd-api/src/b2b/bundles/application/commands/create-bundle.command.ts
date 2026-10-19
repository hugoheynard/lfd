/** Ce que la création demande : nom, description, groupes et leurs choix. */
export interface CreateBundleInput {
  readonly name: string;
  readonly description: string | null;
  readonly groups: readonly { readonly label: string; readonly choices: readonly string[] }[];
}

/** **Créer** une formule, en brouillon. Rend sa clé, tirée du nom. */
export class CreateBundleCommand {
  constructor(
    readonly bundle: CreateBundleInput,
    readonly writtenBy: string | null,
  ) {}
}
