import type { BundleGroupDraft } from "../../domain/value-objects/bundle-composition.js";

/**
 * **Enregistrer la composition** d'une formule — groupes et choix, ENTIERS,
 * dans l'ordre voulu.
 */
export class SaveBundleCompositionCommand {
  constructor(
    readonly key: string,
    readonly groups: readonly BundleGroupDraft[],
    readonly writtenBy: string | null,
  ) {}
}
