/** Retire le prix public : l'article repasse à l'étiquette du PIM et suivra ses changements. */
export class AlignPublicOnPimCommand {
  constructor(readonly sku: string) {}
}
