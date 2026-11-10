import type { BundleChoiceView, BundleView } from "@lfd/contracts";

import type { BundleSnapshot } from "../../domain/entities/bundle-shapes.js";
import type { BundleChoiceArticle } from "../../domain/ports/bundle-choice-article.js";
import type { BundleChoiceCatalogue } from "../../domain/ports/bundle-choice.catalogue.js";
import { choicesOf } from "../../domain/value-objects/bundle-composition.js";

/**
 * Les formules vers l'écran, chaque choix accompagné de ce que le catalogue
 * en dit AUJOURD'HUI — une seule lecture du catalogue pour toutes.
 */
export async function bundleViews(
  snapshots: readonly BundleSnapshot[],
  catalogue: BundleChoiceCatalogue,
): Promise<BundleView[]> {
  const skus = [...new Set(snapshots.flatMap((snapshot) => choicesOf(snapshot.groups)))];
  const articles = await catalogue.articlesAmong(skus);
  return snapshots.map((snapshot) => viewOf(snapshot, articles));
}

function viewOf(
  snapshot: BundleSnapshot,
  articles: ReadonlyMap<string, BundleChoiceArticle>,
): BundleView {
  return {
    key: snapshot.key,
    name: snapshot.name,
    description: snapshot.description,
    audience: snapshot.audience,
    status: snapshot.status,
    groups: snapshot.groups.map((group) => ({
      key: group.key,
      label: group.label,
      choices: group.choices.map((sku) => choiceView(sku, articles.get(sku))),
    })),
    createdAt: snapshot.createdAt.toISOString(),
    writtenAt: snapshot.writtenAt.toISOString(),
    writtenBy: snapshot.writtenBy,
  };
}

/** Un article que le catalogue ne connaît plus reste dans la formule, dit `unknown`. */
function choiceView(sku: string, article: BundleChoiceArticle | undefined): BundleChoiceView {
  if (article === undefined) {
    return { sku, name: null, shelf: null, thumbnailUrl: null, standing: "unknown" };
  }
  return {
    sku,
    name: article.name,
    shelf: article.shelf,
    thumbnailUrl: article.thumbnailUrl,
    standing: article.verdict,
  };
}
