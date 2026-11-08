import { Injectable } from "@nestjs/common";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import type { MailBrandCode } from "../../../requests/domain/value-objects/mail-brand.js";
import { MarketingPreference } from "../../domain/entities/marketing-preference.js";
import { MarketingPreferenceRepository } from "../../domain/ports/marketing-preference.repository.js";
import type { MarketingAddress } from "../../domain/value-objects/marketing-address.js";

/**
 * **L'état suit l'adresse** (plan de désinscription, règle 24) : un compte
 * change d'adresse, et ce que le registre savait de l'ancienne vaut pour la
 * nouvelle. À appeler dans une unité de travail : plusieurs lignes, toutes
 * ou aucune.
 *
 * - un « non » (désinscription, ou réinscription pas encore confirmée) se
 *   COPIE sur la nouvelle adresse, et reste sur l'ancienne : il protège les
 *   deux, et retirer celui de l'ancienne reviendrait à réécrire à une boîte
 *   qui a dit non ;
 * - un accord (ou une demande en attente) DÉMÉNAGE : la ligne passe à la
 *   nouvelle adresse, état et preuve compris — un accord reste accordé ;
 * - la nouvelle adresse a déjà sa ligne : un « non » l'emporte toujours ; un
 *   accord confirme une demande ordinaire en attente ; sinon rien.
 */
@Injectable()
export class MarketingAddressMover {
  constructor(
    private readonly preferences: MarketingPreferenceRepository,
    private readonly ids: IdGenerator,
  ) {}

  async move(
    space: MailBrandCode | null,
    from: MarketingAddress,
    to: MarketingAddress,
    at: Date,
  ): Promise<void> {
    if (from.print === to.print) {
      return;
    }
    for (const line of await this.linesOf(space, from)) {
      const target = await this.preferences.load(line.space, to.print);
      await (target === null ? this.carry(line, to) : this.merge(line, target, at));
    }
  }

  private async linesOf(
    space: MailBrandCode | null,
    from: MarketingAddress,
  ): Promise<readonly MarketingPreference[]> {
    if (space === null) {
      return this.preferences.loadAll(from.print);
    }
    const line = await this.preferences.load(space, from.print);
    return line === null ? [] : [line];
  }

  private async carry(line: MarketingPreference, to: MarketingAddress): Promise<void> {
    const refusal = line.unsubscribeAct;
    if (refusal !== null) {
      await this.preferences.save(
        MarketingPreference.optedOut(this.ids.next(), line.space, to, refusal),
      );
      return;
    }
    line.relocate(to);
    await this.preferences.relocate(line);
  }

  private async merge(
    line: MarketingPreference,
    target: MarketingPreference,
    at: Date,
  ): Promise<void> {
    const refusal = line.unsubscribeAct;
    if (refusal !== null) {
      if (target.unsubscribe(refusal)) {
        await this.preferences.save(target);
      }
      return;
    }
    if (line.allowsMarketing() && target.isPending() && !target.awaitsResubscription()) {
      target.confirm(at);
      await this.preferences.save(target);
    }
  }
}
