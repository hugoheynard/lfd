import { Injectable } from "@nestjs/common";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import type { MailBrandCode } from "../../../requests/domain/value-objects/mail-brand.js";
import { MarketingPreference } from "../../domain/entities/marketing-preference.js";
import type { UnsubscribeAct } from "../../domain/entities/marketing-preference-state.js";
import { MarketingPreferenceRepository } from "../../domain/ports/marketing-preference.repository.js";
import type { MarketingAddress } from "../../domain/value-objects/marketing-address.js";

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
  ): Promise<void> {
    const known = await this.preferences.load(space, address.print);
    if (known === null) {
      await this.preferences.save(
        MarketingPreference.optedOut(this.ids.next(), space, address, act),
      );
      return;
    }
    if (known.unsubscribe(act)) {
      await this.preferences.save(known);
    }
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
