import type { OperationScheduleInput } from "../../domain/value-objects/operation-schedule.js";

/** **Redater** une opération : les cinq dates, ensemble — leur ordre ne se juge qu'à cinq. */
export class RescheduleOperationCommand {
  constructor(
    readonly key: string,
    readonly schedule: OperationScheduleInput,
    readonly writtenBy: string | null,
  ) {}
}
