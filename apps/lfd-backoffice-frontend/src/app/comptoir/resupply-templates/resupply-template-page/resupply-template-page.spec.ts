import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { PickupAddressesService } from '../../../b2b/reglages/pickup-addresses.service';
import { ResupplyReceiptsService } from '../../reassort-boutique-page/resupply-receipts.service';
import { ARTICLES, baseMatin, FakeTemplatesService, refusal } from '../resupply-template.testing';
import { ResupplyTemplatesService } from '../resupply-templates.service';
import { ResupplyTemplatePage } from './resupply-template-page';

async function settle(fixture: {
  whenStable(): Promise<unknown>;
  detectChanges(): void;
}): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

async function mount(templateId: string | undefined, service = new FakeTemplatesService()) {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ResupplyTemplatePage],
    providers: [
      provideRouter([]),
      { provide: ResupplyTemplatesService, useValue: service },
      { provide: ResupplyReceiptsService, useValue: { articles: () => Promise.resolve(ARTICLES) } },
      {
        provide: PickupAddressesService,
        useValue: { list: () => Promise.resolve([{ id: 'site_v', label: 'Val Village' }]) },
      },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(ResupplyTemplatePage);
  fixture.componentRef.setInput('siteId', 'site_v');
  fixture.componentRef.setInput('templateId', templateId);
  fixture.detectChanges();
  await settle(fixture);
  const root = fixture.nativeElement as HTMLElement;
  const save = async (): Promise<void> => {
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('[data-template-save]')?.click();
    await settle(fixture);
  };
  return { fixture, page: fixture.componentInstance, root, service, save, navigate };
}

describe('ResupplyTemplatePage', () => {
  it('reprend le modèle : nom, visée, quantités, et ses lignes inapplicables à part', async () => {
    const { root, page } = await mount('tpl_1');
    expect(page['name']()).toBe('Base matin');
    expect(page['quantityOf']('CRO')).toBe(12);
    expect(root.querySelector('[data-stale-line="OLD"]')?.textContent).toContain('Article retiré');
    expect(root.querySelector('[data-stale-line="BAG"]')?.textContent).toContain('Unité de vente');
  });

  it('ajuste sous la version lue ; une ligne inapplicable retirée ne s’enregistre plus', async () => {
    const { page, service, save, root } = await mount('tpl_1');
    page['dropStale']('OLD');
    page['setQuantity']('PAC', 4);
    await save();
    expect(service.adjusted[0]?.payload).toEqual({
      name: 'Base matin',
      target: 'tomorrow',
      version: 1,
      lines: [
        { sku: 'CRO', quantity: 12, saleUnit: 'piece' },
        { sku: 'PAC', quantity: 4, saleUnit: 'piece' },
        { sku: 'BAG', quantity: 500, saleUnit: 'weight' },
      ],
    });
    expect(root.querySelector('[data-template-done]')).not.toBeNull();
    expect(page['version']()).toBe(2);
  });

  it('un nom pris se dit sur le champ', async () => {
    const service = new FakeTemplatesService();
    service.adjustFailure = refusal(
      409,
      'resupply.template.name_taken',
      'Un modèle de ce point s’appelle déjà « Goûter ».',
    );
    const { page, save, root } = await mount('tpl_1', service);
    await save();
    expect(page['nameErrors']()[0]?.message).toContain('Goûter');
    expect(root.querySelector('[data-template-failure]')).toBeNull();
  });

  it('une version périmée relit le modèle, l’affiche, et le dit', async () => {
    const service = new FakeTemplatesService();
    service.adjustFailure = refusal(409, 'resupply.template.changed_meanwhile', 'modifié');
    const { page, save, root } = await mount('tpl_1', service);
    page['setQuantity']('CRO', 30);
    service.templates = [{ ...baseMatin(3), name: 'Base du matin' }];
    await save();
    expect(page['version']()).toBe(3);
    expect(page['name']()).toBe('Base du matin');
    expect(page['quantityOf']('CRO')).toBe(12);
    expect(root.querySelector('[data-template-failure]')?.textContent).toContain('version à jour');
  });

  it('crée un modèle neuf sous une clé d’intention, puis revient à la bibliothèque', async () => {
    const { page, service, save, navigate } = await mount(undefined);
    page['typeName']('Goûter');
    page['setQuantity']('BAG', 6);
    await save();
    expect(service.created).toHaveLength(1);
    expect(service.created[0]?.payload).toMatchObject({
      name: 'Goûter',
      target: 'tomorrow',
      lines: [{ sku: 'BAG', quantity: 6, saleUnit: 'piece' }],
    });
    expect(service.created[0]?.payload.key).not.toBe('');
    expect(navigate).toHaveBeenCalledWith(['/comptoir/modeles-reassort'], {
      queryParams: { point: 'site_v' },
    });
  });

  it('refuse d’enregistrer un modèle sans nom, sans appeler le serveur', async () => {
    const { page, service, save } = await mount(undefined);
    page['setQuantity']('BAG', 6);
    await save();
    expect(service.created).toEqual([]);
    expect(page['nameErrors']()).toHaveLength(1);
  });

  it('un modèle absent de la bibliothèque le dit', async () => {
    const { root } = await mount('tpl_gone');
    expect(root.querySelector('[data-template-missing]')).not.toBeNull();
  });

  it('le lien retour garde le point, et navigue sans recharger la page', async () => {
    const { root, navigate } = await mount('tpl_1');
    const link = root.querySelector<HTMLAnchorElement>('[data-template-back] a');
    expect(link?.getAttribute('href')).toBe('/comptoir/modeles-reassort?point=site_v');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    link?.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith(['/comptoir/modeles-reassort'], {
      queryParams: { point: 'site_v' },
    });
  });
});
