import { Injectable } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import type { ResupplyLaunchGesture } from "../../domain/entities/production-day.js";

/**
 * **Qui lance, et quand** — le geste « Lancer » : l'instant du `Clock` et le
 * nom de qui lance, figé maintenant (le fait le recopie, l'écran du comptoir
 * l'affiche). Sorti de `LaunchResupplyHandler` (audit du réassort,
 * 2026-11-02) ; lu AVANT le verrou de la journée : une lecture d'annuaire
 * n'a pas à le tenir, et l'instant est celui, unique, de la requête.
 */
@Injectable()
export class ResupplyLaunchGestures {
  constructor(
    private readonly authors: StaffAuthorDirectory,
    private readonly clock: Clock,
  ) {}

  async of(staffUserId: string): Promise<ResupplyLaunchGesture> {
    const name = (await this.authors.identify([staffUserId])).nameOf(staffUserId);
    return { at: this.clock.now(), staffUserId, name };
  }
}
