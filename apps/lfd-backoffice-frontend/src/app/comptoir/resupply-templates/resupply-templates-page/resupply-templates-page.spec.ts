import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { PickupAddressesService } from '../../../b2b/reglages/pickup-addresses.service';
import { baseMatin, FakeTemplatesService, refusal } from '../resupply-template.testing';
import { ResupplyTemplatesService } from '../resupply-templates.service';
import { ResupplyTemplatesPage, templateCardOf } from './resupply-templates-page';

async function mount(
  point: string | undefined,
  service = new FakeTemplatesService(),
  canWrite = true,
) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ResupplyTemplatesPage],
    providers: [
      provideRouter([]),
      { provide: ResupplyTemplatesService, useValue: service },
      {
        provide: PickupAddressesService,
        useValue: { list: () => Promise.resolve([{ id: 'site_v', label: 'Val Village' }]) },
      },
      { provide: PermissionsStore, useValue: { can: () => canWrite } },
    ],
  });
  const fixture = TestBed.createComponent(ResupplyTemplatesPage);
  fixture.componentRef.setInput('point', point);
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
  return { root: fixture.nativeElement as HTMLElement, service };
}

describe('templateCardOf', () => {
  it('dit la visée, le nombre d’articles, et les lignes inapplicables', () => {
    const card = templateCardOf(baseMatin());
    expect(card).toMatchObject({
      id: 'tpl_1',
      name: 'Base matin',
      summary: 'Pour demain · 3 articles',
    });
    expect(card.warning).toContain('2 lignes');
  });

  it('dit l’heure par défaut d’un modèle « pour demain » (H1)', () => {
    expect(templateCardOf({ ...baseMatin(), arrivalBy: '06:30' }).summary).toBe(
      'Pour demain, 6 h 30 · 3 articles',
    );
  });

  it('ne dit rien quand tout s’applique', () => {
    const template = { ...baseMatin(), lines: baseMatin().lines.slice(0, 1) };
    expect(templateCardOf(template)).toMatchObject({
      summary: 'Pour demain · 1 article',
      warning: null,
    });
  });
});

describe('ResupplyTemplatesPage', () => {
  it('sans point, invite à en choisir un et ne lit aucune bibliothèque', async () => {
    const { root, service } = await mount(undefined);
    expect(root.textContent).toContain('Choisissez un point');
    expect(service.calls).toEqual([]);
  });

  it('liste les modèles du point, et signale les lignes inapplicables', async () => {
    const { root } = await mount('site_v');
    expect(root.querySelector('[data-template="tpl_1"]')?.textContent).toContain('Base matin');
    expect(root.querySelector('[data-template-stale]')).not.toBeNull();
    expect(root.textContent).toContain('Nouveau modèle');
  });

  it('une lecture refusée ne se fait pas passer pour une bibliothèque vide', async () => {
    const service = new FakeTemplatesService();
    service.listFailure = refusal(503, 'down', 'Le serveur ne répond pas.');
    const { root } = await mount('site_v', service);
    expect(root.textContent).toContain('Impossible de lire les modèles du point');
    expect(root.textContent).not.toContain('Aucun modèle');
  });

  it('sans le droit d’écrire, ni création ni ajustement', async () => {
    const { root } = await mount('site_v', new FakeTemplatesService(), false);
    expect(root.textContent).not.toContain('Nouveau modèle');
    expect(root.textContent).not.toContain('Ajuster');
  });
});
