import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { CatalogPendingDiffView } from "@lfd/pim-contracts";

import { Clock } from "../../../../platform/time/clock.js";
import { AccountingRulesRepository } from "../../../accounting-rules/domain/ports/accounting-rules.repository.js";
import { PimJournalReader } from "../../../journal/pim-journal-reader.js";
import { GLOBAL_CAUSE_TYPES, causesOf } from "../domain/attribution.js";
import { diffItem, headerDiff, planDiff } from "../domain/diff.js";
import { CatalogRevisionRepository } from "../domain/ports/catalog-revision.repository.js";
import { CatalogRevisionSource } from "../domain/ports/catalog-revision.source.js";
import { buildRevision } from "../domain/revision.js";
import { attributeItem, causeViews, summaryOf } from "./revision-diff-support.js";

export class DiffCatalogSinceLastQuery {}

/**
 * **Ce qui a bougé depuis la dernière ancre publiée — en détail.**
 *
 * Le même diff que celui entre deux ancres, avec un côté qui n'est pas figé :
 * le catalogue tel qu'il est, construit en mémoire par `buildRevision`,
 * c'est-à-dire par **exactement la mécanique de la pose**. C'est ce qui garantit
 * qu'un écran ne peut pas annoncer un changement qu'une capture ignorerait, ni
 * l'inverse.
 *
 * ## Pourquoi il ne s'ajoute pas à l'état du catalogue
 *
 * `GetCatalogOverviewQuery` calcule déjà ce plan, et n'en rend que trois
 * nombres. Le détail vit dans une lecture SÉPARÉE plutôt que dans la même,
 * parce que les deux ne coûtent pas la même chose : l'état du catalogue est
 * l'en-tête d'un écran qu'on ouvre tout le temps, et il ne lit aucun payload.
 * Le détail, lui, charge un payload par article modifié et interroge le journal
 * produit par produit. Les fondre ferait payer ce prix à chaque affichage de
 * l'en-tête, pour un détail que personne n'aurait demandé.
 *
 * Le compteur reste donc, et il reste juste : les deux traversent `planDiff`.
 *
 * ## La paresse est conservée d'un seul côté
 *
 * Le magasin adressé par contenu ne charge que les payloads des SKU dont
 * l'empreinte diffère — sur mille articles dont trois ont bougé, trois
 * lectures. Côté vivant il n'y a rien à charger : les payloads viennent d'être
 * construits, ils sont en mémoire. Le diff vivant coûte donc **moins** qu'un
 * diff entre deux ancres, pas plus.
 *
 * ⚠️ **La référence est la dernière ancre PUBLIÉE, pas la dernière posée.** Un
 * catalogue qu'on n'a fait que simuler n'a aucune référence : `from` vaut alors
 * `null`, et les listes vides ne veulent PAS dire « rien n'a changé ». Prendre
 * la dernière posée ferait annoncer N changements sur un catalogue qu'on vient
 * de republier entier — l'écart se voit sur un aller-retour A → B → A.
 */
@QueryHandler(DiffCatalogSinceLastQuery)
export class DiffCatalogSinceLastHandler implements IQueryHandler<
  DiffCatalogSinceLastQuery,
  CatalogPendingDiffView
> {
  constructor(
    private readonly source: CatalogRevisionSource,
    private readonly revisions: CatalogRevisionRepository,
    private readonly accounting: AccountingRulesRepository,
    private readonly journal: PimJournalReader,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<CatalogPendingDiffView> {
    // Un seul instant pour toute la lecture : il borne l'intervalle
    // d'attribution ET date ce que l'écran montre. Deux lectures d'horloge
    // dériveraient, et un fait tombé entre les deux n'appartiendrait à aucun
    // intervalle.
    const at = this.clock.now();
    const [items, rules, latest] = await Promise.all([
      this.source.snapshotItems(),
      this.accounting.read(),
      this.revisions.lastPublished(),
    ]);
    const current = buildRevision(
      { proRatioBp: rules?.rules.proPriceRatio.basisPoints ?? null },
      items,
    );

    if (latest === null) {
      return {
        from: null,
        at: at.toISOString(),
        causes: [],
        header: [],
        added: [],
        removed: [],
        changed: [],
      };
    }

    const afterIndex = {
      hashBySku: new Map(current.items.map((item) => [item.sku, item.hash])),
      proRatioBp: current.header.proRatioBp,
    };
    const beforeIndex = await this.revisions.indexOf(latest.id);
    const plan = planDiff(beforeIndex, afterIndex);

    // Les causes globales se lisent UNE fois pour tout le diff, pas une fois
    // par article : un taux révisé est un seul fait, et le relire cent fois
    // coûterait cent requêtes pour cent copies de la même ligne.
    const [beforePayloads, causes] = await Promise.all([
      this.revisions.payloadsOf(latest.id, plan.changed),
      this.journal
        .factsBetween(GLOBAL_CAUSE_TYPES, latest.takenAt, at)
        .then((facts) => causesOf(facts)),
    ]);
    const afterPayloads = new Map(current.items.map((item) => [item.sku, item.payload]));

    return {
      from: summaryOf(latest),
      at: at.toISOString(),
      causes: causeViews(causes),
      header: headerDiff(beforeIndex, afterIndex),
      added: plan.added,
      removed: plan.removed,
      changed: await Promise.all(
        plan.changed.flatMap((sku) => {
          const before = beforePayloads.get(sku);
          const after = afterPayloads.get(sku);
          // Les deux existent : le plan les a désignés parce que les DEUX index
          // les portent. Un manque côté ancre signalerait une ligne
          // d'appartenance sans contenu, que la clé étrangère interdit.
          if (before === undefined || after === undefined) {
            return [];
          }
          return [
            attributeItem(
              this.journal,
              diffItem(sku, before, after),
              after,
              latest.takenAt,
              at,
              causes,
            ),
          ];
        }),
      ),
    };
  }
}
