import type { PlatformSettings } from "@lfd/contracts";

/** Commande **staff** : remplacer la config plateforme (tout le dictionnaire de modes). */
export class UpdatePlatformSettingsCommand {
  constructor(readonly settings: PlatformSettings) {}
}
