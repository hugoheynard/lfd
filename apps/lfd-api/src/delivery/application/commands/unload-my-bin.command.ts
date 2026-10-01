/** Décharger un bac de MA tournée encore au dépôt (PL1). */
export class UnloadMyBinCommand {
  constructor(
    readonly staffUserId: string,
    readonly roundId: string,
    readonly binId: string,
  ) {}
}
