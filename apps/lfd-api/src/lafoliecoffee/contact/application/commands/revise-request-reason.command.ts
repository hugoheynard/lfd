import type { RequestReasonPayload } from "@lfd/contracts";

/** Remplacer le réglage entier d'un motif — son `kind` répété, jamais changé. */
export class ReviseRequestReasonCommand {
  constructor(
    readonly reasonId: string,
    readonly payload: RequestReasonPayload,
  ) {}
}
