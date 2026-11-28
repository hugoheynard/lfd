/** Allume ou éteint le réassort, pour tout le monde. Acte staff. */
export class SetResupplySwitchCommand {
  constructor(
    readonly enabled: boolean,
    readonly staffUserId: string,
  ) {}
}
