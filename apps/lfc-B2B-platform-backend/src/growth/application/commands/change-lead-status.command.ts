import type { LeadStatus } from "@lfd/contracts";

/**
 * Command : faire **avancer** manuellement un lead dans le pipeline (le staff, après
 * un appel / RDV). Cible restreinte aux transitions manuelles (jamais `new`).
 */
export class ChangeLeadStatusCommand {
  constructor(
    readonly leadId: string,
    readonly status: Exclude<LeadStatus, "new">,
  ) {}
}
