import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { CatalogRevisionRowView } from "@lfd/pim-contracts";

import { planDiff } from "../domain/diff.js";
import { CatalogRevisionRepository } from "../domain/ports/catalog-revision.repository.js";
import { summaryOf } from "./revision-diff-support.js";

/** Au-delà, un écran pagine — il ne déroule pas trois ans d'ancres. */
const MAX = 50;

export class ListCatalogRevisionsQuery {}

/**
 * **Les ancres, de la plus récente à la plus ancienne** — et ce qui sépare
 * chacune de la précédente.
 *
 * ## Pourquoi l'écart est calculé ici
 *
 * « 97 articles » dit la TAILLE d'une ancre, jamais son intérêt : deux ancres
 * consécutives de 97 articles peuvent différer d'une ligne ou de quarante, et
 * rien à l'écran ne le disait. C'est pourtant la première question qu'on se
 * pose devant un historique — laquelle a bougé.
 *
 * ## Une ancre de PLUS que demandé
 *
 * On lit `MAX + 1` ancres pour n'en rendre que `MAX` : la plus ancienne de la
 * page a besoin de sa devancière pour se comparer. Sans elle, la dernière ligne
 * afficherait `null` non pas parce qu'elle n'a pas de précédente, mais parce
 * que la page s'arrêtait là — et ce serait un blanc qui ment.
 *
 * ⚠️ `changes` reste `null` sur la **plus ancienne ancre du dépôt** : il n'y a
 * rien avant elle. Un `0` dirait « rien n'a changé », ce qui est faux — tout
 * était nouveau.
 */
@QueryHandler(ListCatalogRevisionsQuery)
export class ListCatalogRevisionsHandler implements IQueryHandler<
  ListCatalogRevisionsQuery,
  readonly CatalogRevisionRowView[]
> {
  constructor(private readonly revisions: CatalogRevisionRepository) {}

  async execute(): Promise<readonly CatalogRevisionRowView[]> {
    const records = await this.revisions.list(MAX + 1);
    // DEUX requêtes pour toute la page, quelle que soit sa longueur. Boucler
    // sur `indexOf` en ferait cinquante — chacune rapide, leur somme non.
    const indexes = await this.revisions.indexesOf(records.map((record) => record.id));

    return records.slice(0, MAX).map((record, position) => {
      // La suivante dans la liste est la PRÉCÉDENTE dans le temps : l'ordre est
      // du plus récent au plus ancien.
      const older = records[position + 1];
      const after = indexes.get(record.id);
      const before = older === undefined ? undefined : indexes.get(older.id);
      return {
        ...summaryOf(record),
        changes:
          after === undefined || before === undefined ? null : countOf(planDiff(before, after)),
      };
    });
  }
}

/**
 * Combien d'ARTICLES séparent deux ancres — entrés, retirés, modifiés confondus.
 *
 * Un seul nombre et non trois : la liste répond à « laquelle a bougé », pas à
 * « comment ». Le détail se lit dans le diff, qui a un écran à lui.
 */
function countOf(plan: {
  added: readonly string[];
  removed: readonly string[];
  changed: readonly string[];
}): number {
  return plan.added.length + plan.removed.length + plan.changed.length;
}
