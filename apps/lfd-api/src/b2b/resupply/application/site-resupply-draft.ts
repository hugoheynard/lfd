import { IdGenerator } from "../../../platform/id/id-generator.js";
import { ResupplyCatalogue } from "../domain/resupply-catalogue.js";
import { ResupplyArticleUnknownError } from "../domain/resupply-receipt-errors.js";
import type { SaleUnit } from "../domain/resupply-sale-unit.js";
import { ResupplyArticleUnitChangedError } from "../domain/resupply-sale-unit-errors.js";
import { type ResupplyTarget, serviceDayFor, SiteResupply } from "../domain/site-resupply.js";
import { SiteResupplyNotFoundError } from "../domain/site-resupply-errors.js";
import { SiteResupplyLine } from "../domain/site-resupply-line.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";

/**
 * Gardes et gestes PARTAGÉS par les cas de la demande en cours (R1c),
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

/**
 * Une ligne demandée, son libellé ET son unité lus au catalogue publié —
 * jamais pris du client (L2b-1 : l'unité se fige ici). `saleUnit`, quand
 * l'appelant en garde une (le brouillon du fournil), doit être celle du
 * catalogue : sinon la quantité se lirait dans l'autre unité.
 *
 * @throws {ResupplyArticleUnitChangedError} l'unité gardée n'est plus celle du catalogue.
 */
export async function catalogueLine(
  catalogue: ResupplyCatalogue,
  requested: {
    readonly sku: string;
    readonly quantity: number;
    readonly saleUnit?: SaleUnit | undefined;
  },
): Promise<SiteResupplyLine> {
  const article = await catalogue.article(requested.sku);
  if (article === null) {
    throw new ResupplyArticleUnknownError(requested.sku);
  }
  if (requested.saleUnit !== undefined && requested.saleUnit !== article.saleUnit) {
    throw new ResupplyArticleUnitChangedError(article.sku, article.name);
  }
  return SiteResupplyLine.of({
    sku: article.sku,
    label: article.name,
    quantity: requested.quantity,
    saleUnit: article.saleUnit,
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

/** Ce qu'un geste sur la demande en cours porte : la demande, et la version que le poste a vue. */
export interface DraftGesture {
  readonly siteId: string;
  readonly resupplyId: string;
  readonly seenVersion: number;
}

/**
 * **Un geste sur la demande en cours, sous la version vue** — la mécanique
 * commune à corriger et retirer une ligne, qui se recopiaient à la mutation
 * près (audit du réassort, 2026-11-02) : chargée sous le point, refusée si
 * le poste n'a plus la dernière version, mutée par l'agrégat, sauvée.
 */
export async function changeDraft(
  resupplies: SiteResupplyRepository,
  gesture: DraftGesture,
  mutate: (draft: SiteResupply) => void,
): Promise<void> {
  const draft = await loadSiteResupply(resupplies, gesture.siteId, gesture.resupplyId);
  draft.assertSeen(gesture.seenVersion);
  mutate(draft);
  await resupplies.save(draft);
}
