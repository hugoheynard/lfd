import { IdGenerator } from "../../../platform/id/id-generator.js";
import { ResupplyCatalogue } from "../domain/resupply-catalogue.js";
import { ResupplyArticleUnknownError } from "../domain/resupply-receipt-errors.js";
import { type ResupplyTarget, serviceDayFor, SiteResupply } from "../domain/site-resupply.js";
import { SiteResupplyNotFoundError } from "../domain/site-resupply-errors.js";
import { SiteResupplyLine } from "../domain/site-resupply-line.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";

/**
 * Gardes et gestes PARTAGÉS par les cas de la demande en cours (lot R1c),
 * et la lecture d'une ligne au catalogue, que l'envoi du fournil (R1d)
 * partage aussi.
 */

/** La demande en cours du point pour cette visée à l'instant `at`, ouverte si aucune. */
export async function currentDraft(
  resupplies: SiteResupplyRepository,
  ids: IdGenerator,
  input: { readonly siteId: string; readonly target: ResupplyTarget; readonly at: Date },
): Promise<SiteResupply> {
  const serviceDay = serviceDayFor(input.target, input.at);
  const open = await resupplies.openDraft(input.siteId, input.target, serviceDay);
  return open ?? SiteResupply.draft({ id: ids.next(), ...input });
}

/** Une ligne demandée, son libellé lu au catalogue publié — jamais pris du client. */
export async function catalogueLine(
  catalogue: ResupplyCatalogue,
  requested: { readonly sku: string; readonly quantity: number },
): Promise<SiteResupplyLine> {
  const article = await catalogue.article(requested.sku);
  if (article === null) {
    throw new ResupplyArticleUnknownError(requested.sku);
  }
  return SiteResupplyLine.of({
    sku: article.sku,
    label: article.name,
    quantity: requested.quantity,
  });
}

/** Ajoute un article au brouillon, son libellé lu au catalogue publié. */
export async function addArticle(
  catalogue: ResupplyCatalogue,
  resupply: SiteResupply,
  requested: { readonly sku: string; readonly quantity: number },
): Promise<void> {
  resupply.addLine(await catalogueLine(catalogue, requested));
}

/** Le réassort sous le point de l'URL : celui d'un autre point est introuvable. */
export async function loadSiteResupply(
  resupplies: SiteResupplyRepository,
  siteId: string,
  resupplyId: string,
): Promise<SiteResupply> {
  const resupply = await resupplies.load(siteId, resupplyId);
  if (resupply === null) {
    throw new SiteResupplyNotFoundError(resupplyId);
  }
  return resupply;
}
