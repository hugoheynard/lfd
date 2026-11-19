import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { ApplyModeDialog } from '../../resupply-templates/apply-mode-dialog/apply-mode-dialog';
import {
  baseMatin,
  FakeTemplatesService,
  refusal,
} from '../../resupply-templates/resupply-template.testing';
import { ResupplyTemplatesService } from '../../resupply-templates/resupply-templates.service';
import type { TemplateNameDialogData } from '../../resupply-templates/template-name-dialog/template-name-dialog';
import { ARTICLES, FakeResupplies } from '../resupply-stock.testing';
import { SiteResuppliesService } from '../site-resupplies.service';
import { SiteResuppliesStore } from '../site-resupplies.store';
import { ResupplyTemplatesMenu } from './resupply-templates-menu';

/** Le panneau fold, joué : chaque ouverture rend la réponse suivante de la file. */
class FakePanels {
  readonly opened: { component: unknown; data: unknown }[] = [];
  answers: ((data: unknown) => Promise<unknown>)[] = [];
  open(component: unknown, config: { data?: unknown }): { closed: Promise<unknown> } {
    this.opened.push({ component, data: config.data });
    const answer = this.answers.shift();
    return { closed: answer === undefined ? Promise.resolve(undefined) : answer(config.data) };
  }
}

interface Mounted {
  readonly fixture: ComponentFixture<ResupplyTemplatesMenu>;
  readonly menu: ResupplyTemplatesMenu;
  readonly resupplies: FakeResupplies;
  readonly templates: FakeTemplatesService;
  readonly panels: FakePanels;
  readonly settle: () => Promise<void>;
  readonly text: () => string;
}

async function mount(options: { readonly canWriteTemplates?: boolean } = {}): Promise<Mounted> {
  const resupplies = new FakeResupplies();
  const templates = new FakeTemplatesService();
  const panels = new FakePanels();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ResupplyTemplatesMenu],
    providers: [
      SiteResuppliesStore,
      { provide: SiteResuppliesService, useValue: resupplies },
      { provide: ResupplyTemplatesService, useValue: templates },
      { provide: FoldPanelHostService, useValue: panels },
    ],
  });
  const store = TestBed.inject(SiteResuppliesStore);
  await store.load('site_v');
  const fixture = TestBed.createComponent(ResupplyTemplatesMenu);
  const syncDraft = (): void => {
    fixture.componentRef.setInput(
      'draft',
      store.drafts().find((draft) => draft.target === 'tomorrow') ?? null,
    );
  };
  fixture.componentRef.setInput('siteId', 'site_v');
  fixture.componentRef.setInput('target', 'tomorrow');
  fixture.componentRef.setInput('articles', ARTICLES);
  fixture.componentRef.setInput('canApply', true);
  fixture.componentRef.setInput('canWriteTemplates', options.canWriteTemplates ?? true);
  syncDraft();
  const settle = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    syncDraft();
    fixture.detectChanges();
  };
  await settle();
  return {
    fixture,
    menu: fixture.componentInstance,
    resupplies,
    templates,
    panels,
    settle,
    text: () => (fixture.nativeElement as HTMLElement).textContent ?? '',
  };
}

/** Les gestes protégés du composant, appelés comme le ferait le menu. */
function gestures(menu: ResupplyTemplatesMenu): {
  apply: (template: ReturnType<typeof baseMatin>) => Promise<void>;
  update: () => Promise<void>;
  saveAsTemplate: () => Promise<void>;
} {
  return {
    apply: (template) => menu['apply'](template),
    update: () => menu['update'](),
    saveAsTemplate: () => menu['saveAsTemplate'](),
  };
}

describe('ResupplyTemplatesMenu — appliquer un modèle au comptoir', () => {
  it('applique directement en « Remplacer » sur une demande vide', async () => {
    const { menu, resupplies, panels, settle } = await mount();
    await gestures(menu).apply(baseMatin());
    await settle();
    expect(panels.opened).toEqual([]);
    expect(resupplies.calls).toEqual(['apply tomorrow tpl_1 replace']);
  });

  it('demande « Remplacer · Ajouter » quand la demande a des lignes', async () => {
    const { menu, resupplies, panels, settle } = await mount();
    await resupplies.addLine('site_v', 'tomorrow', 'PAC', 4, 'k');
    await TestBed.inject(SiteResuppliesStore).load('site_v');
    await settle();
    panels.answers = [() => Promise.resolve('add')];
    await gestures(menu).apply(baseMatin());
    await settle();
    expect(panels.opened[0]?.component).toBe(ApplyModeDialog);
    expect(resupplies.calls.at(-1)).toBe('apply tomorrow tpl_1 add');
  });

  it("n'applique rien si l'on ferme la question", async () => {
    const { menu, resupplies, settle } = await mount();
    await resupplies.addLine('site_v', 'tomorrow', 'PAC', 4, 'k');
    await TestBed.inject(SiteResuppliesStore).load('site_v');
    await settle();
    await gestures(menu).apply(baseMatin());
    expect(resupplies.calls.some((call) => call.startsWith('apply'))).toBe(false);
  });

  it('nomme les articles écartés, par leur libellé', async () => {
    const { menu, resupplies, settle, text } = await mount();
    resupplies.skipped = [{ sku: 'BAG', reason: 'sale_unit_changed' }];
    await gestures(menu).apply(baseMatin());
    await settle();
    expect(text()).toContain('1 article écarté : Baguette (unité de vente changée depuis).');
  });
});

describe('ResupplyTemplatesMenu — affiner le modèle depuis la demande', () => {
  async function appliedThenAdjusted(): Promise<Mounted> {
    const mounted = await mount();
    await gestures(mounted.menu).apply(baseMatin());
    await mounted.settle();
    await mounted.resupplies.addLine('site_v', 'tomorrow', 'CRO', 2, 'k');
    await TestBed.inject(SiteResuppliesStore).load('site_v');
    await mounted.settle();
    return mounted;
  }

  it("dit l'écart avec le modèle appliqué", async () => {
    const { text } = await appliedThenAdjusted();
    expect(text()).toContain('Écart avec « Base matin » : +2 Croissant.');
    expect(text()).toContain('Mettre à jour « Base matin »');
  });

  it('ne propose pas la mise à jour sans le droit des modèles', async () => {
    const mounted = await mount({ canWriteTemplates: false });
    await gestures(mounted.menu).apply(baseMatin());
    await mounted.resupplies.addLine('site_v', 'tomorrow', 'CRO', 2, 'k');
    await TestBed.inject(SiteResuppliesStore).load('site_v');
    await mounted.settle();
    expect(mounted.text()).not.toContain('Mettre à jour');
  });

  it('met à jour sous la version lue, en gardant les lignes inapplicables', async () => {
    const { menu, templates, settle } = await appliedThenAdjusted();
    await gestures(menu).update();
    await settle();
    expect(templates.adjusted).toEqual([
      {
        templateId: 'tpl_1',
        payload: {
          name: 'Base matin',
          target: 'tomorrow',
          version: 1,
          lines: [
            { sku: 'CRO', quantity: 14, saleUnit: 'piece' },
            { sku: 'OLD', quantity: 3, saleUnit: 'piece' },
            { sku: 'BAG', quantity: 500, saleUnit: 'weight' },
          ],
        },
      },
    ]);
  });

  it('sur une version périmée, relit le modèle et le dit — sans écraser', async () => {
    const { menu, templates, settle, text } = await appliedThenAdjusted();
    templates.adjustFailure = refusal(409, 'resupply.template.changed_meanwhile', 'Modifié.');
    templates.templates = [baseMatin(2)];
    await gestures(menu).update();
    await settle();
    expect(templates.adjusted).toHaveLength(1);
    expect(text()).toContain('a été modifié depuis un autre poste');
    templates.adjustFailure = null;
    await gestures(menu).update();
    expect(templates.adjusted[1]?.payload.version).toBe(2);
  });
});

describe('ResupplyTemplatesMenu — enregistrer comme modèle', () => {
  it('crée un modèle des lignes de la demande, à la visée affichée', async () => {
    const { menu, resupplies, templates, panels, settle, text } = await mount();
    await resupplies.addLine('site_v', 'tomorrow', 'PAC', 4, 'k');
    await TestBed.inject(SiteResuppliesStore).load('site_v');
    await settle();
    panels.answers = [
      async (data) =>
        (await (data as TemplateNameDialogData).save('Matin')) === null ? 'Matin' : undefined,
    ];
    await gestures(menu).saveAsTemplate();
    await settle();
    expect(templates.created).toHaveLength(1);
    expect(templates.created[0]?.payload).toMatchObject({
      name: 'Matin',
      target: 'tomorrow',
      lines: [{ sku: 'PAC', quantity: 4, saleUnit: 'piece' }],
    });
    expect(text()).toContain('Modèle « Matin » enregistré.');
  });
});
