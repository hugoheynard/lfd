/**
 * « Monté » — le fournil dit au comptoir d'un point servi sur place que son
 * réassort est là (lot R3e). Acte staff, sous `production_resupply`.
 */
export class MarkResupplyMountedCommand {
  constructor(
    readonly siteId: string,
    readonly resupplyId: string,
    readonly staffUserId: string,
  ) {}
}
