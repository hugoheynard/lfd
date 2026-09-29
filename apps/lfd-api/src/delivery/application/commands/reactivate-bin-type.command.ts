/** Remettre un type de bac archivé en service. */
export class ReactivateBinTypeCommand {
  constructor(readonly binTypeId: string) {}
}
