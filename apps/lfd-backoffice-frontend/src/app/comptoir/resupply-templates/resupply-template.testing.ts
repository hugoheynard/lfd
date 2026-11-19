import { HttpErrorResponse } from '@angular/common/http';
import type {
  AdjustResupplyTemplatePayload,
  CreateResupplyTemplatePayload,
  ResupplyArticleView,
  ResupplyTemplateView,
  SavedResupplyTemplateResponse,
} from '@lfd/contracts';

/** Le catalogue du réassort des specs : deux familles. */
export const ARTICLES: readonly ResupplyArticleView[] = [
  {
    sku: 'CRO',
    name: 'Croissant',
    categoryId: 'fam_m',
    categoryName: 'Viennoiseries',
    saleUnit: 'piece',
  },
  {
    sku: 'PAC',
    name: 'Pain au chocolat',
    categoryId: 'fam_m',
    categoryName: 'Viennoiseries',
    saleUnit: 'piece',
  },
  { sku: 'BAG', name: 'Baguette', categoryId: 'fam_b', categoryName: 'Pains', saleUnit: 'piece' },
];

/** « Base matin » : une ligne qui s'applique, une retirée, une d'unité changée. */
export function baseMatin(version = 1): ResupplyTemplateView {
  return {
    id: 'tpl_1',
    version,
    siteId: 'site_v',
    name: 'Base matin',
    target: 'tomorrow',
    lines: [
      { sku: 'CRO', quantity: 12, saleUnit: 'piece', articleName: 'Croissant', issue: null },
      { sku: 'OLD', quantity: 3, saleUnit: 'piece', articleName: null, issue: 'withdrawn' },
      {
        sku: 'BAG',
        quantity: 500,
        saleUnit: 'weight',
        articleName: 'Baguette',
        issue: 'sale_unit_changed',
      },
    ],
    updatedByName: 'Lou',
    updatedAt: '2026-01-03T06:00:00.000Z',
  };
}

/** Un refus de l'API, avec son code. */
export function refusal(status: number, code: string, message: string): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { code, message } });
}

/** Le service des modèles, joué en mémoire. */
export class FakeTemplatesService {
  readonly calls: string[] = [];
  readonly created: { siteId: string; payload: CreateResupplyTemplatePayload }[] = [];
  readonly adjusted: { templateId: string; payload: AdjustResupplyTemplatePayload }[] = [];
  templates: ResupplyTemplateView[] = [baseMatin()];
  listFailure: unknown = null;
  createFailure: unknown = null;
  adjustFailure: unknown = null;

  list(siteId: string): Promise<readonly ResupplyTemplateView[]> {
    this.calls.push(`list ${siteId}`);
    return this.listFailure === null
      ? Promise.resolve(this.templates.filter((template) => template.siteId === siteId))
      : Promise.reject(this.listFailure);
  }

  create(
    siteId: string,
    payload: CreateResupplyTemplatePayload,
  ): Promise<SavedResupplyTemplateResponse> {
    this.calls.push(`create ${siteId}`);
    this.created.push({ siteId, payload });
    if (this.createFailure !== null) {
      return Promise.reject(this.createFailure);
    }
    return Promise.resolve({ id: payload.key, version: 1 });
  }

  adjust(
    templateId: string,
    payload: AdjustResupplyTemplatePayload,
  ): Promise<SavedResupplyTemplateResponse> {
    this.calls.push(`adjust ${templateId}`);
    this.adjusted.push({ templateId, payload });
    if (this.adjustFailure !== null) {
      return Promise.reject(this.adjustFailure);
    }
    return Promise.resolve({ id: templateId, version: payload.version + 1 });
  }

  archive(templateId: string): Promise<void> {
    this.calls.push(`archive ${templateId}`);
    this.templates = this.templates.filter((template) => template.id !== templateId);
    return Promise.resolve();
  }
}
