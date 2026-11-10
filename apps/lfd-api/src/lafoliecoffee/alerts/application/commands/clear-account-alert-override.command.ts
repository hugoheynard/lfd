import type { AlertKind } from "@lfd/contracts";

/** Commande **staff** : ce compte revient au réglage global pour ce type. */
export class ClearAccountAlertOverrideCommand {
  constructor(
    readonly companyId: string,
    readonly kind: AlertKind,
  ) {}
}
