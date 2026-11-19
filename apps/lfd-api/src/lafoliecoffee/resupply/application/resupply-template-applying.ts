import type { ResupplyTemplateApplyMode, SkippedResupplyTemplateLine } from "@lfd/contracts";

import type { ResupplyArticle } from "../domain/resupply-catalogue.js";
import type { ResupplyTemplate } from "../domain/resupply-template.js";
import { templateLineIssueOf } from "../domain/resupply-template-applicability.js";
import type { SiteResupply } from "../domain/site-resupply.js";
import { SiteResupplyLine } from "../domain/site-resupply-line.js";

/** Les lignes d'un modèle confrontées au catalogue : celles qui se posent, celles écartées. */
export interface SortedTemplateLines {
  readonly applicable: readonly SiteResupplyLine[];
  readonly skipped: readonly SkippedResupplyTemplateLine[];
}

/**
 * Confronte chaque ligne du modèle au catalogue du réassort d'aujourd'hui
 * (M6) : un article retiré ou dont l'unité a changé est écarté et rendu,
 * jamais posé ni corrigé en douce. Le libellé et l'unité d'une ligne posée
 * sont ceux du catalogue, comme pour un ajout à la main.
 */
export function sortTemplateLines(
  template: ResupplyTemplate,
  articles: readonly ResupplyArticle[],
): SortedTemplateLines {
  const bySku = new Map(articles.map((article) => [article.sku, article]));
  const applicable: SiteResupplyLine[] = [];
  const skipped: SkippedResupplyTemplateLine[] = [];
  for (const line of template.content.lines) {
    const article = bySku.get(line.sku);
    const issue = templateLineIssueOf(line, article);
    if (issue !== null || article === undefined) {
      skipped.push({ sku: line.sku, reason: issue ?? "withdrawn" });
      continue;
    }
    applicable.push(
      SiteResupplyLine.of({
        sku: article.sku,
        label: article.name,
        quantity: line.quantity,
        saleUnit: article.saleUnit,
      }),
    );
  }
  return { applicable, skipped };
}

/**
 * Pose les lignes du modèle sur la demande en cours, par les gestes de
 * l'agrégat — ses règles (brouillon seulement, borne, unité) valent ici
 * comme à la main.
 *
 * - `add` : chaque ligne s'ajoute, une quantité déjà présente s'additionne ;
 * - `replace` : les articles absents du modèle sont retirés D'ABORD (la
 *   borne compte ce qui reste), puis chaque ligne prend la quantité du
 *   modèle. Une ligne de la demande dans une autre unité est retirée puis
 *   reposée dans celle du catalogue : corriger sa seule quantité la lirait
 *   dans l'ancienne unité.
 */
export function applyTemplateLines(
  draft: SiteResupply,
  template: ResupplyTemplate,
  lines: readonly SiteResupplyLine[],
  mode: ResupplyTemplateApplyMode,
): void {
  if (mode === "replace") {
    replaceLines(draft, template, lines);
  } else {
    for (const line of lines) {
      draft.addLine(line);
    }
  }
}

function replaceLines(
  draft: SiteResupply,
  template: ResupplyTemplate,
  lines: readonly SiteResupplyLine[],
): void {
  const inTemplate = new Set(template.content.lines.map((line) => line.sku));
  for (const existing of draft.lines) {
    if (!inTemplate.has(existing.sku)) {
      draft.withdrawLine(existing.sku);
    }
  }
  for (const line of lines) {
    const existing = draft.lines.find((candidate) => candidate.sku === line.sku);
    if (existing === undefined) {
      draft.addLine(line);
    } else if (existing.saleUnit === line.saleUnit) {
      draft.correctLine(line.sku, line.quantity);
    } else {
      draft.withdrawLine(line.sku);
      draft.addLine(line);
    }
  }
}
