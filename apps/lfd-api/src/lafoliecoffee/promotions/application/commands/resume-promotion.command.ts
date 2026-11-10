/** **Reprendre** une promotion suspendue. */
export class ResumePromotionCommand {
  constructor(
    readonly id: string,
    readonly staffUserId: string,
    readonly reason: string | null,
  ) {}
}
