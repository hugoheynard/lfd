/** **Rouvrir un jour fermé** — il redevient un jour de production (Q6). */
export class RemoveProductionClosedDayCommand {
  constructor(
    readonly serviceDay: string,
    /** L'identité staff, résolue par le guard. Le journal la porte comme acteur. */
    readonly staffUserId: string,
  ) {}
}
