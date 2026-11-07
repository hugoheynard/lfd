import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { StaffPermission } from '@lfd/contracts';
import {
  modelBlockId,
  type MailDocumentBlockPreviewPayload,
  type MailEditorPhrasePlace,
  type MailEditorPhraseView,
  type MailEditorResources,
  type MailEditorView,
} from '@lfd/mail-blocks';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { MailEditorService } from '../../data/mail-editor.service';
import {
  MailPublishDialog,
  type MailPublishDialogData,
} from '../mail-publish-dialog/mail-publish-dialog';
import {
  MailRevertDialog,
  type MailRevertDialogData,
} from '../mail-revert-dialog/mail-revert-dialog';
import { MailTrialDialog, type MailTrialDialogData } from '../mail-trial-dialog/mail-trial-dialog';
import { DOCUMENT_DRAFT_DEBOUNCE_MS, MailTemplatePage } from './mail-template-page';

const TEMPLATE = 'customer.order-placed';

function phrase(
  path: string,
  place: MailEditorPhrasePlace | null,
  variant: string | null = null,
): MailEditorPhraseView {
  const locale = {
    default: `Texte ${path}`,
    draftState: 'unchanged',
    draftText: null,
    publishedText: null,
    revision: 0,
    defaultChangedSince: null,
  } as const;
  return {
    path,
    variables: [],
    requiredVariables: [],
    place,
    variant,
    staleTranslations: [],
    locales: { fr: locale, en: locale, it: locale },
  };
}

/**
 * La vue servie : `resources` y est obligatoire (§ 24, R2) — l'API la sert
 * toujours ; le contrat ne la laisse facultative que pour le paquet.
 */
type ServedView = MailEditorView & { readonly resources: MailEditorResources };

function view(
  revision: number,
  locales: MailEditorView['declaration']['locales'] = ['fr', 'en'],
): ServedView {
  return {
    template: TEMPLATE,
    audience: 'customer',
    family: 'order',
    declaration: { modelBlocks: ['title', 'footer'], locales, charter: 'lfc' },
    document: {
      template: TEMPLATE,
      blocks: [
        { id: modelBlockId('title'), kind: 'model', section: 'title' },
        { id: modelBlockId('footer'), kind: 'model', section: 'footer' },
      ],
    },
    source: 'starting',
    revision,
    published: null,
    draft: null,
    phrases: [],
    orphans: [],
    cases: [],
    resources: { values: [], links: [], dataBlocks: [] },
  };
}

async function render(
  api: Partial<
    Record<
      | 'load'
      | 'saveDraft'
      | 'preview'
      | 'history'
      | 'publish'
      | 'revert'
      | 'sendTrial'
      | 'blockPreviews',
      ReturnType<typeof vi.fn>
    >
  >,
  permissions: readonly StaffPermission[] = ['mail_templates:write'],
) {
  const notify = { error: vi.fn(), success: vi.fn() };
  TestBed.configureTestingModule({
    imports: [MailTemplatePage],
    providers: [
      provideRouter([]),
      {
        provide: MailEditorService,
        useValue: {
          history: vi.fn(() =>
            Promise.resolve({ template: TEMPLATE, versions: [], retracted: null }),
          ),
          blockPreviews: vi.fn((_template: string, payload: MailDocumentBlockPreviewPayload) =>
            Promise.resolve({
              template: TEMPLATE,
              locale: payload.locale,
              subject: 'Objet',
              header: '',
              footer: '',
              blocks: payload.document.blocks.map((block) => ({
                blockId: block.id,
                html: `<p>${block.id}</p>`,
              })),
            }),
          ),
          ...api,
        },
      },
      { provide: NotifyService, useValue: notify },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission) => permissions.includes(p) },
      },
    ],
  });
  const open = vi.spyOn(TestBed.inject(FoldPanelHostService), 'open');
  const fixture = TestBed.createComponent(MailTemplatePage);
  fixture.componentRef.setInput('template', TEMPLATE);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, notify, open };
}

describe('MailTemplatePage — la page d’un e-mail', () => {
  it('monte le canevas avec le document ouvert, et la langue parmi celles du modèle', async () => {
    const load = vi.fn(() => Promise.resolve(view(0)));
    const { element, fixture } = await render({ load });
    expect(load).toHaveBeenCalledWith(TEMPLATE);
    expect(element.querySelector('app-mail-canvas')).not.toBeNull();
    expect(element.textContent).toContain('Commande passée');
    expect(element.querySelector('[data-save-state]')?.textContent).toContain(
      'Arrangement d’origine',
    );
    expect(fixture.componentInstance.locale()).toBe('fr');
    expect(element.querySelector('[data-locales]')?.textContent).toContain('EN');
    expect(element.querySelector('[data-locales]')?.textContent).not.toContain('IT');
  });

  it('ouvre toutes les langues aux phrases d’un e-mail en français seul, et le dit', async () => {
    const load = vi.fn(() => Promise.resolve(view(0, ['fr'])));
    const { element, fixture } = await render({ load });
    const page = fixture.componentInstance;
    expect(element.querySelector('[data-phrase-locales]')?.textContent).toContain('IT');
    expect(element.querySelector('[data-phrase-locale-note]')).toBeNull();
    page.phraseLocale.set('it');
    fixture.detectChanges();
    expect(page.locale()).toBe('fr');
    expect(element.querySelector('[data-phrase-locale-note]')?.textContent).toContain(
      'part aujourd’hui en français seulement : les phrases en italien se préparent',
    );
  });

  it('ne double pas le choix de langue quand l’e-mail part dans toutes', async () => {
    const load = vi.fn(() => Promise.resolve(view(0, ['fr', 'en', 'it'])));
    const { element } = await render({ load });
    expect(element.querySelector('[data-phrase-locales]')).toBeNull();
  });

  it('dit l’état d’enregistrement, et ne montre « Publier » et le menu qu’à qui écrit', async () => {
    const load = vi.fn(() => Promise.resolve(view(0)));
    const reader = await render({ load }, ['mail_templates:read']);
    expect(reader.element.querySelector('[data-publish]')).toBeNull();
    expect(reader.element.querySelector('[data-more]')).toBeNull();
    TestBed.resetTestingModule();
    const writer = await render({ load });
    expect(writer.element.querySelector('[data-save-state]')?.textContent).toContain(
      'Arrangement d’origine',
    );
    expect(writer.element.querySelector('[data-publish]')).not.toBeNull();
    expect(writer.element.querySelector('[data-more]')).not.toBeNull();
    expect(writer.element.querySelector('fold-inline-confirm')).toBeNull();
    expect(writer.element.querySelector('[data-save]')).toBeNull();
  });

  it('met les options de l’aperçu dans la barre d’outils, et les passe à l’aperçu', async () => {
    const { fixture, element } = await render({ load: vi.fn(() => Promise.resolve(view(0))) });
    const toolbar = element.querySelector('[data-toolbar]');
    for (const marker of [
      '[data-locales]',
      '[data-phrase-source]',
      '[data-device]',
      '[data-scheme]',
      '[data-render]',
    ]) {
      expect(toolbar?.querySelector(marker)).not.toBeNull();
    }
    expect(toolbar?.querySelector('[data-render]')?.textContent).toContain('Rendre l’aperçu');
    expect(element.querySelector('app-mail-faithful-preview [data-device]')).toBeNull();
    fixture.componentInstance.device.set('phone');
    fixture.detectChanges();
    expect(element.querySelector('app-mail-template-tabs')).not.toBeNull();
  });

  it('enregistre le brouillon tout seul après la pause, sur la révision lue, sans relire', async () => {
    const load = vi.fn(() => Promise.resolve(view(3)));
    const saveDraft = vi.fn(() => Promise.resolve());
    const { fixture, element } = await render({ load, saveDraft });
    const page = fixture.componentInstance;
    vi.useFakeTimers();
    try {
      const edited = { template: TEMPLATE, blocks: [...view(0).document.blocks].reverse() };
      page.document.set(edited);
      TestBed.tick();
      expect(page.saveState()).toBe('pending');
      fixture.detectChanges();
      expect(element.querySelector('[data-save-state]')?.textContent).toContain(
        'Modifications non enregistrées',
      );
      vi.advanceTimersByTime(DOCUMENT_DRAFT_DEBOUNCE_MS - 1);
      expect(saveDraft).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(page.saveState()).toBe('saving');
      await vi.runAllTimersAsync();
      expect(saveDraft).toHaveBeenCalledWith(TEMPLATE, { document: edited, expectedRevision: 3 });
      expect(load).toHaveBeenCalledTimes(1);
      expect(page.document()).toBe(edited);
      expect(page.saveState()).toBe('saved');
      fixture.detectChanges();
      expect(element.querySelector('[data-save-state]')?.textContent).toMatch(
        /Brouillon enregistré · \d{2} h \d{2}/,
      );
      // La révision suivante sert l'enregistrement d'après.
      const again = { template: TEMPLATE, blocks: [] };
      page.document.set(again);
      TestBed.tick();
      await page.flushDocument();
      expect(saveDraft).toHaveBeenLastCalledWith(TEMPLATE, {
        document: again,
        expectedRevision: 4,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('un refus garde le document à l’écran, se dit, et attend le geste suivant', async () => {
    const load = vi.fn(() => Promise.resolve(view(3)));
    const saveDraft = vi.fn(() =>
      Promise.reject(
        new HttpErrorResponse({ status: 400, error: { message: 'Un bloc est vide.' } }),
      ),
    );
    const { fixture, element } = await render({ load, saveDraft });
    const page = fixture.componentInstance;
    const edited = { template: TEMPLATE, blocks: [] };
    page.document.set(edited);
    TestBed.tick();
    await page.flushDocument();
    fixture.detectChanges();
    expect(page.document()).toBe(edited);
    expect(page.saveState()).toBe('refused');
    expect(element.querySelector('[data-save-state]')?.textContent).toContain(
      'Refusé — voir les blocs',
    );
    expect(element.querySelector('[data-save-refusal]')?.textContent).toContain(
      'Un bloc est vide.',
    );
    expect(element.querySelector('[data-reload]')).toBeNull();
    await page.flushDocument();
    expect(saveDraft).toHaveBeenCalledTimes(1);
  });

  it('un conflit offre de relire la version enregistrée', async () => {
    const load = vi.fn(() => Promise.resolve(view(3)));
    const saveDraft = vi.fn(() => Promise.reject(new HttpErrorResponse({ status: 409 })));
    const { fixture, element } = await render({ load, saveDraft });
    const page = fixture.componentInstance;
    page.document.set({ template: TEMPLATE, blocks: [] });
    TestBed.tick();
    await page.flushDocument();
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('[data-reload]')?.click();
    await fixture.whenStable();
    expect(load).toHaveBeenCalledTimes(2);
    expect(page.saveState()).toBe('idle');
  });

  it('dit l’échec de lecture', async () => {
    const { element } = await render({ load: vi.fn(() => Promise.reject(new Error('boom'))) });
    expect(element.querySelector('fold-empty-state')?.getAttribute('tone')).toBe('alert');
    expect(element.querySelector('app-mail-canvas')).toBeNull();
  });

  it('« Publier » ouvre la fenêtre fold : ce qui part, les phrases, aucun refus ; publie après avoir enregistré', async () => {
    const load = vi.fn().mockResolvedValueOnce(view(3)).mockResolvedValueOnce(view(5));
    const saveDraft = vi.fn(() => Promise.resolve());
    const publish = vi.fn(() => Promise.resolve({ publicationVersion: 7 }));
    const { fixture, element, notify, open } = await render({ load, saveDraft, publish });
    const page = fixture.componentInstance;
    const edited = { template: TEMPLATE, blocks: [...view(0).document.blocks].reverse() };
    page.document.set(edited);
    TestBed.tick();
    element.querySelector<HTMLButtonElement>('[data-publish]')?.click();
    const [component, config] = open.mock.calls[0] ?? [];
    expect(component).toBe(MailPublishDialog);
    const data = (config as { data: MailPublishDialogData }).data;
    expect(data.recipients).toBe('les clients');
    expect(data.issues()).toEqual([]);
    expect(data.saveRefusal()).toBeNull();
    expect(data.pendingPhrases()).toBe(0);
    expect(await data.publish()).toBeNull();
    expect(saveDraft).toHaveBeenCalledWith(TEMPLATE, { document: edited, expectedRevision: 3 });
    expect(publish).toHaveBeenCalledWith(TEMPLATE, { expectedRevision: 4 });
    expect(load).toHaveBeenCalledTimes(2);
    expect(notify.success).toHaveBeenCalled();
  });

  it('la fenêtre de « Publier » dit les refus, et rien ne part', async () => {
    const publish = vi.fn();
    const missing = view(3);
    const withParagraph: ServedView = {
      ...missing,
      document: {
        template: TEMPLATE,
        blocks: [
          ...missing.document.blocks,
          { id: 'free-1', kind: 'paragraph', text: { fr: 'Bonjour' } },
        ],
      },
    };
    const { fixture, open } = await render({
      load: vi.fn(() => Promise.resolve(withParagraph)),
      publish,
    });
    fixture.componentInstance.openPublish();
    const data = (open.mock.calls[0]?.[1] as { data: MailPublishDialogData }).data;
    expect(data.issues().length).toBeGreaterThan(0);
    expect(await data.publish()).not.toBeNull();
    expect(publish).not.toHaveBeenCalled();
  });

  it('rend le refus du serveur à la fenêtre, tel quel, et garde la vue', async () => {
    const load = vi.fn(() => Promise.resolve(view(3)));
    const publish = vi.fn(() =>
      Promise.reject(new HttpErrorResponse({ status: 409, error: { message: 'Rien à publier.' } })),
    );
    const { fixture } = await render({ load, publish });
    expect(await fixture.componentInstance.publish()).toContain('Rien à publier.');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('revenir au modèle d’origine : la fenêtre dit ce qui est effacé, puis revient sur la révision lue', async () => {
    const pristine = await render({ load: vi.fn(() => Promise.resolve(view(0))) });
    pristine.fixture.componentInstance.openRevert();
    expect(pristine.open).toHaveBeenCalledTimes(1);
    TestBed.resetTestingModule();
    const published: ServedView = {
      ...view(5),
      source: 'published',
      published: { version: 2, at: '2026-11-07T10:00:00.000Z', staffId: 'stf_1' },
    };
    const load = vi.fn(() => Promise.resolve(published));
    const revert = vi.fn(() => Promise.resolve({ publicationVersion: 8 }));
    const { fixture, open } = await render({ load, revert });
    fixture.componentInstance.openRevert();
    const [component, config] = open.mock.calls[0] ?? [];
    expect(component).toBe(MailRevertDialog);
    const data = (config as { data: MailRevertDialogData }).data;
    expect(data.erased.join(' ')).toContain('version publiée (n° 2) est retirée');
    expect(await data.revert()).toBeNull();
    expect(revert).toHaveBeenCalledWith(TEMPLATE, { expectedRevision: 5 });
  });

  it('tout enregistré : la sortie passe ; en attente ou refusé : retenue une fois, puis passe', async () => {
    const saveDraft = vi.fn(() => Promise.reject(new HttpErrorResponse({ status: 400 })));
    const { fixture, element } = await render({
      load: vi.fn(() => Promise.resolve(view(3))),
      saveDraft,
    });
    const page = fixture.componentInstance;
    expect(page.canLeave()).toBe(true);
    page.document.set({ template: TEMPLATE, blocks: [] });
    TestBed.tick();
    expect(page.canLeave()).toBe(false);
    await page.flushDocument();
    fixture.detectChanges();
    expect(page.saveState()).toBe('refused');
    expect(element.querySelector('[data-leave-warning]')?.textContent).toContain('refusé');
    expect(page.canLeave()).toBe(true);
  });

  it('un brouillon enregistré ne retient pas la sortie', async () => {
    const { fixture } = await render({
      load: vi.fn(() => Promise.resolve(view(3))),
      saveDraft: vi.fn(() => Promise.resolve()),
    });
    const page = fixture.componentInstance;
    page.document.set({ template: TEMPLATE, blocks: [] });
    TestBed.tick();
    await page.flushDocument();
    expect(page.saveState()).toBe('saved');
    expect(page.canLeave()).toBe(true);
  });

  it('les cas du modèle : le premier choisi, l’autre se choisit', async () => {
    const load = vi.fn(() =>
      Promise.resolve({
        ...view(0),
        cases: [
          { id: 'specimen', label: 'Payée par carte' },
          { id: 'due', label: 'À régler' },
        ],
      }),
    );
    const { fixture, element } = await render({ load });
    expect(fixture.componentInstance.caseId()).toBe('specimen');
    expect(element.querySelector('[data-toolbar] [data-cases]')).not.toBeNull();
    expect(element.querySelector('[data-case-choice]')).toBeNull();
  });

  it('le menu ouvre la fenêtre d’essai avec la langue, le cas et les phrases courants', async () => {
    const load = vi.fn(() =>
      Promise.resolve({ ...view(0), cases: [{ id: 'due', label: 'À régler' }] }),
    );
    const { fixture, open } = await render({ load });
    const page = fixture.componentInstance;
    page.locale.set('en');
    page.phraseSource.set('published');
    page.openTrial();
    const [component, config] = open.mock.calls[0] ?? [];
    expect(component).toBe(MailTrialDialog);
    const data = (config as { data: MailTrialDialogData }).data;
    expect(data).toMatchObject({ locale: 'en', caseId: 'due', source: 'published' });
    expect(data.locales.map((option) => option.value)).toEqual(['fr', 'en']);
  });

  it('l’essai part au choix de la fenêtre, avec la même clé tant qu’il n’a pas abouti', async () => {
    const load = vi.fn(() =>
      Promise.resolve({ ...view(0), cases: [{ id: 'due', label: 'À régler' }] }),
    );
    const sendTrial = vi
      .fn()
      .mockRejectedValueOnce(new HttpErrorResponse({ status: 500 }))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    const { fixture, notify } = await render({ load, sendTrial });
    const page = fixture.componentInstance;
    const choice = { locale: 'en', caseId: 'due', source: 'draft' } as const;
    expect(await page.sendTrial(choice)).not.toBeNull();
    expect(await page.sendTrial(choice)).toBeNull();
    expect(await page.sendTrial({ ...choice, source: 'published' })).toBeNull();
    const keys = sendTrial.mock.calls.map((call) => call[2]);
    expect(sendTrial.mock.calls[0]?.slice(0, 2)).toEqual([
      TEMPLATE,
      { locale: 'en', source: 'draft', caseId: 'due' },
    ]);
    expect(sendTrial.mock.calls[2]?.[1]).toEqual({
      locale: 'en',
      source: 'published',
      caseId: 'due',
    });
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
    expect(notify.success).toHaveBeenCalledWith('Essai envoyé à votre adresse.');
  });

  it('range les phrases sous le bloc ou le cadre sélectionné, nommées par leur variante', async () => {
    const load = vi.fn(() =>
      Promise.resolve({
        ...view(0),
        phrases: [
          phrase('title.paid', { kind: 'block', block: 'title' }, 'Commande payée par carte'),
          phrase('title.due', { kind: 'block', block: 'title' }, 'Commande à régler'),
          phrase('subject', { kind: 'frame', frame: 'subject' }),
          phrase('image.alt', null),
        ],
        orphans: [phrase('gone', null)],
      }),
    );
    const { fixture, element } = await render({ load });
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    expect(element.querySelector('[data-focus-panel]')).toBeNull();
    expect(element.querySelector('[data-focus-hint]')).not.toBeNull();
    element.querySelector<HTMLElement>(`li[data-block="${modelBlockId('title')}"]`)?.click();
    fixture.detectChanges();
    const panel = element.querySelector('[data-focus-panel]');
    expect(
      [...(panel?.querySelectorAll('[data-phrase]') ?? [])].map((n) =>
        n.getAttribute('data-phrase'),
      ),
    ).toEqual(['title.paid', 'title.due']);
    expect(panel?.textContent).toContain('Commande payée par carte');
    element.querySelector<HTMLElement>('[data-frame="subject"]')?.click();
    fixture.detectChanges();
    expect(
      element.querySelector('[data-focus-panel] [data-phrase]')?.getAttribute('data-phrase'),
    ).toBe('subject');
    expect(element.querySelector('[data-unplaced] [data-phrase="image.alt"]')).not.toBeNull();
    expect(element.querySelector('[data-orphans] [data-phrase="gone"]')).not.toBeNull();
    expect(element.querySelector('[data-other-texts] [data-unplaced]')).not.toBeNull();
  });

  it('avec une liste de phrases éditables, le panneau et « Autres textes » ne montrent qu’elles', async () => {
    const base = view(0);
    const load = vi.fn(() =>
      Promise.resolve({
        ...base,
        declaration: { ...base.declaration, editablePhrases: ['title.paid', 'subject'] },
        phrases: [
          phrase('title.paid', { kind: 'block', block: 'title' }),
          phrase('title.recapLabel', { kind: 'block', block: 'title' }),
          phrase('subject', { kind: 'frame', frame: 'subject' }),
          phrase('image.alt', null),
        ],
      }),
    );
    const { fixture, element } = await render({ load });
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    element.querySelector<HTMLElement>(`li[data-block="${modelBlockId('title')}"]`)?.click();
    fixture.detectChanges();
    expect(
      [...element.querySelectorAll('[data-focus-panel] [data-phrase]')].map((n) =>
        n.getAttribute('data-phrase'),
      ),
    ).toEqual(['title.paid']);
    expect(element.querySelector('[data-other-texts]')).toBeNull();
  });

  it('demande le rendu du canevas : document à l’écran, langue, cas, phrases en brouillon', async () => {
    const load = vi.fn(() =>
      Promise.resolve({ ...view(0), cases: [{ id: 'due', label: 'À régler' }] }),
    );
    const blockPreviews = vi.fn(() =>
      Promise.resolve({
        template: TEMPLATE,
        locale: 'fr',
        subject: '',
        header: '',
        footer: '',
        blocks: [{ blockId: modelBlockId('title'), html: '<p>Rendu du serveur</p>' }],
      }),
    );
    const { fixture, element } = await render({ load, blockPreviews });
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    expect(blockPreviews).toHaveBeenCalledWith(TEMPLATE, {
      document: view(0).document,
      locale: 'fr',
      source: 'draft',
      caseId: 'due',
    });
    expect(element.querySelector('[data-mail]')?.textContent).toContain('Rendu du serveur');
  });
});
