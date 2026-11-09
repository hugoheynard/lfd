import { Injectable } from "@nestjs/common";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import type { MailBrandCode } from "../../../requests/domain/value-objects/mail-brand.js";
import { MarketingPreference } from "../../domain/entities/marketing-preference.js";
import type { UnsubscribeAct } from "../../domain/entities/marketing-preference-state.js";
import { MarketingPreferenceRepository } from "../../domain/ports/marketing-preference.repository.js";
import type { MarketingAddress } from "../../domain/value-objects/marketing-address.js";

/** Ce qu'une désinscription a touché : la ligne, et si elle a changé (le geste du staff le trace). */
export interface MarketingUnsubscription {
  readonly preferenceId: string;
  readonly changed: boolean;
}

/**
 * **La désinscription, une seule fois écrite** (plan de désinscription,
 * règles 15 et 20) : la page, le one-click et le canal passent tous ici.
 * À appeler dans une unité de travail : « tout le groupe » écrit plusieurs
 * lignes, toutes ou aucune.
 */
@Injectable()
export class MarketingUnsubscriber {
  constructor(
    private readonly preferences: MarketingPreferenceRepository,
    private readonly ids: IdGenerator,
  ) {}

  /**
   * Désinscrit l'adresse de cet espace. Une adresse que le registre ne
   * connaissait pas y entre désinscrite : la question est éteinte pour
   * toujours.
   */
  async unsubscribe(
    space: MailBrandCode,
    address: MarketingAddress,
    act: UnsubscribeAct,
  ): Promise<MarketingUnsubscription> {
    const known = await this.preferences.load(space, address.print);
    if (known === null) {
      const created = MarketingPreference.optedOut(this.ids.next(), space, address, act);
      await this.preferences.save(created);
      return { preferenceId: created.id, changed: true };
    }
    const changed = known.unsubscribe(act);
    if (changed) {
      await this.preferences.save(known);
    }
    return { preferenceId: known.id, changed };
  }

  /**
   * « Ne plus rien recevoir du groupe » (règle 20) : toutes les AUTRES lignes
   * de cette adresse passent `unsubscribed`, source `group`, quelle que soit
   * leur origine. L'espace du jeton se désinscrit par {@link unsubscribe}.
   */
  async unsubscribeGroup(
    except: MailBrandCode,
    address: MarketingAddress,
    at: Date,
  ): Promise<void> {
    const rows = await this.preferences.loadAll(address.print);
    for (const row of rows.filter((candidate) => candidate.space !== except)) {
      if (row.unsubscribe({ at, source: "group" })) {
        await this.preferences.save(row);
      }
    }
  }
}
