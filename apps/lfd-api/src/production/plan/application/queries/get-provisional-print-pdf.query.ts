/**
 * **Le PDF d'une impression provisoire**, tel qu'il a été rangé au tirage —
 * jamais refait des commandes en direct, qui diraient autre chose que les
 * empreintes gardées.
 */
export class GetProvisionalPrintPdfQuery {
  constructor(
    readonly serviceDay: string,
    readonly id: string,
  ) {}
}
