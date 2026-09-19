import type { VolumeLadderDraft } from "../../domain/entities/volume-ladder.js";

/**
 * **Poser un barème de volume** — une échelle, pas N règles.
 *
 * Un geste qui remplace l'ancien « ajouter un palier » : les paliers d'une même
 * cible forment une seule décision, et se saisissent ensemble.
 */
export class SetVolumeLadderCommand {
  constructor(
    readonly draft: VolumeLadderDraft,
    readonly staffUserId: string,
  ) {}
}
