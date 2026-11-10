/** **Poser la sélection** d'une opération : la liste ENTIÈRE, dans l'ordre du rayon. */
export class SetOperationSelectionCommand {
  constructor(
    readonly key: string,
    readonly skus: readonly string[],
    readonly writtenBy: string | null,
  ) {}
}
