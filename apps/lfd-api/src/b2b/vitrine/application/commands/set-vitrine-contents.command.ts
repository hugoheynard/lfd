import type { VitrineContent } from "@lfd/contracts";

/** Choisir les ensembles qu'un abonné reçoit. */
export class SetVitrineContentsCommand {
  constructor(
    readonly subscriberId: string,
    readonly contents: readonly VitrineContent[],
  ) {}
}
