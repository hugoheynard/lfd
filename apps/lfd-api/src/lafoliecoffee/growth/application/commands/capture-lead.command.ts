import type { CaptureLeadPayload } from "@lfd/contracts";

/** Command : **saisir** un lead cold (démarchage sortant). */
export class CaptureLeadCommand {
  constructor(readonly payload: CaptureLeadPayload) {}
}
