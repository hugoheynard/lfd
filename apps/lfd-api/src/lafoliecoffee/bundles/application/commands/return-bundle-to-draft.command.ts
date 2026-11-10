/** **Remettre en brouillon** une formule retirée, pour la reprendre. */
export class ReturnBundleToDraftCommand {
  constructor(
    readonly key: string,
    readonly writtenBy: string | null,
  ) {}
}
