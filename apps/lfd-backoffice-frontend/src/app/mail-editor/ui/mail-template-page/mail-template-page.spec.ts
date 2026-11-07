import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { StaffPermission } from '@lfd/contracts';
import {
  modelBlockId,
  type MailDocumentBlockPreviewPayload,
  type MailEditorPhrasePlace,
  type MailEditorPhraseView,
  type MailEditorView,
} from '@lfd/mail-blocks';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { MailEditorService } from '../../data/mail-editor.service';
import { MailTemplatePage } from './mail-template-page';

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

function view(
  revision: number,
  locales: MailEditorView['declaration']['locales'] = ['fr', 'en'],
): MailEditorView {
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
  const fixture = TestBed.createComponent(MailTemplatePage);
  fixture.componentRef.setInput('template', TEMPLATE);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, notify };
}

describe('MailTemplatePage — la page d’un e-mail', () => {
  it('monte le canevas avec le document ouvert, et la langue parmi celles du modèle', async () => {
    const load = vi.fn(() => Promise.resolve(view(0)));
    const { element, fixture } = await render({ load });
    expect(load).toHaveBeenCalledWith(TEMPLATE);
    expect(element.querySelector('app-mail-canvas')).not.toBeNull();
    expect(element.textContent).toContain('Commande passée');
    expect(element.querySelector('[data-source]')?.textContent).toContain('Arrangement d’origine');
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

  it('n’offre d’enregistrer qu’à qui écrit, et seulement un document modifié', async () => {
    const load = vi.fn(() => Promise.resolve(view(0)));
    const reader = await render({ load }, ['mail_templates:read']);
    expect(reader.element.querySelector('[data-save]')).toBeNull();
    TestBed.resetTestingModule();
    const writer = await render({ load });
    expect(writer.element.querySelector<HTMLButtonElement>('[data-save]')?.disabled).toBe(true);
  });

  it('enregistre le brouillon avec la révision lue, puis relit', async () => {
    const load = vi.fn().mockResolvedValueOnce(view(3)).mockResolvedValueOnce(view(4));
    const saveDraft = vi.fn(() => Promise.resolve());
    const { fixture, notify } = await render({ load, saveDraft });
    const page = fixture.componentInstance;
    const edited = { template: TEMPLATE, blocks: [...view(0).document.blocks].reverse() };
    page.document.set(edited);
    expect(page.dirty()).toBe(true);
    await page.save();
    expect(saveDraft).toHaveBeenCalledWith(TEMPLATE, { document: edited, expectedRevision: 3 });
    expect(load).toHaveBeenCalledTimes(2);
    expect(page.dirty()).toBe(false);
    expect(notify.success).toHaveBeenCalled();
  });

  it('garde le document à l’écran quand l’enregistrement est refusé', async () => {
    const load = vi.fn(() => Promise.resolve(view(3)));
    const saveDraft = vi.fn(() => Promise.reject(new Error('409')));
    const { fixture, notify } = await render({ load, saveDraft });
    const page = fixture.componentInstance;
    const edited = { template: TEMPLATE, blocks: [] };
    page.document.set(edited);
    await page.save();
    expect(page.document()).toBe(edited);
    expect(notify.error).toHaveBeenCalled();
  });

  it('dit l’échec de lecture', async () => {
    const { element } = await render({ load: vi.fn(() => Promise.reject(new Error('boom'))) });
    expect(element.querySelector('fold-empty-state')?.getAttribute('tone')).toBe('alert');
    expect(element.querySelector('app-mail-canvas')).toBeNull();
  });

  it('publie avec la révision lue, relit, et relit l’historique', async () => {
    const load = vi.fn().mockResolvedValueOnce(view(3)).mockResolvedValueOnce(view(4));
    const publish = vi.fn(() => Promise.resolve({ publicationVersion: 7 }));
    const history = vi.fn(() =>
      Promise.resolve({ template: TEMPLATE, versions: [], retracted: null }),
    );
    const { fixture, notify } = await render({ load, publish, history });
    const page = fixture.componentInstance;
    await page.publish();
    expect(publish).toHaveBeenCalledWith(TEMPLATE, { expectedRevision: 3 });
    expect(load).toHaveBeenCalledTimes(2);
    expect(notify.success).toHaveBeenCalled();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(history).toHaveBeenCalledTimes(2);
  });

  it('ne publie pas un document modifié et non enregistré', async () => {
    const publish = vi.fn();
    const { fixture } = await render({ load: vi.fn(() => Promise.resolve(view(3))), publish });
    const page = fixture.componentInstance;
    page.document.set({ template: TEMPLATE, blocks: [...view(0).document.blocks].reverse() });
    await page.publish();
    expect(publish).not.toHaveBeenCalled();
  });

  it('dit les refus de publication avant tout appel', async () => {
    const publish = vi.fn();
    const missing = view(3);
    const withParagraph: MailEditorView = {
      ...missing,
      document: {
        template: TEMPLATE,
        blocks: [
          ...missing.document.blocks,
          { id: 'free-1', kind: 'paragraph', text: { fr: 'Bonjour' } },
        ],
      },
    };
    const { fixture, element } = await render({
      load: vi.fn(() => Promise.resolve(withParagraph)),
      publish,
    });
    const page = fixture.componentInstance;
    expect(page.publicationIssues().length).toBeGreaterThan(0);
    expect(element.querySelector('[data-publication-issues]')).not.toBeNull();
    await page.publish();
    expect(publish).not.toHaveBeenCalled();
  });

  it('montre le refus du serveur tel quel, et garde la vue', async () => {
    const load = vi.fn(() => Promise.resolve(view(3)));
    const publish = vi.fn(() =>
      Promise.reject(new HttpErrorResponse({ status: 409, error: { message: 'Rien à publier.' } })),
    );
    const { fixture, element } = await render({ load, publish });
    await fixture.componentInstance.publish();
    fixture.detectChanges();
    expect(element.querySelector('[data-gesture-error]')?.textContent).toContain('Rien à publier.');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('revient au modèle d’origine avec la révision lue, seulement s’il y a quelque chose à effacer', async () => {
    const pristine = await render({ load: vi.fn(() => Promise.resolve(view(0))) });
    expect(pristine.element.querySelector('[data-revert]')).toBeNull();
    TestBed.resetTestingModule();
    const published: MailEditorView = {
      ...view(5),
      source: 'published',
      published: { version: 2, at: '2026-11-07T10:00:00.000Z', staffId: 'stf_1' },
    };
    const load = vi.fn(() => Promise.resolve(published));
    const revert = vi.fn(() => Promise.resolve({ publicationVersion: 8 }));
    const { fixture, element } = await render({ load, revert });
    expect(element.querySelector('[data-revert]')).not.toBeNull();
    await fixture.componentInstance.revert();
    expect(revert).toHaveBeenCalledWith(TEMPLATE, { expectedRevision: 5 });
  });

  it('retient une fois la sortie d’un document modifié, puis la laisse passer', async () => {
    const { fixture, element } = await render({ load: vi.fn(() => Promise.resolve(view(3))) });
    const page = fixture.componentInstance;
    expect(page.canLeave()).toBe(true);
    page.document.set({ template: TEMPLATE, blocks: [] });
    expect(page.canLeave()).toBe(false);
    fixture.detectChanges();
    expect(element.querySelector('[data-leave-warning]')).not.toBeNull();
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
    expect(element.querySelector('[data-cases]')).not.toBeNull();
  });

  it('l’essai part dans la langue et le cas courants, avec la même clé tant qu’il n’a pas abouti', async () => {
    const load = vi.fn(() =>
      Promise.resolve({ ...view(0), cases: [{ id: 'due', label: 'À régler' }] }),
    );
    const sendTrial = vi
      .fn()
      .mockRejectedValueOnce(new HttpErrorResponse({ status: 500 }))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    const { fixture, element, notify } = await render({ load, sendTrial });
    expect(element.querySelector('[data-trial]')?.textContent).toContain('M’envoyer un essai');
    const page = fixture.componentInstance;
    page.locale.set('en');
    await page.sendTrial();
    await page.sendTrial();
    await page.sendTrial();
    const keys = sendTrial.mock.calls.map((call) => call[2]);
    expect(sendTrial.mock.calls[0]?.slice(0, 2)).toEqual([
      TEMPLATE,
      { locale: 'en', source: 'draft', caseId: 'due' },
    ]);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
    expect(notify.success).toHaveBeenCalledWith('Essai envoyé à votre adresse.');
  });

  it('sans le droit d’écrire, pas d’essai', async () => {
    const load = vi.fn(() => Promise.resolve(view(0)));
    const { element } = await render({ load }, ['mail_templates:read']);
    expect(element.querySelector('[data-trial]')).toBeNull();
  });

  it('l’essai sur les phrases publiées le dit dans la confirmation, et l’envoie', async () => {
    const load = vi.fn(() => Promise.resolve(view(0)));
    const sendTrial = vi.fn(() => Promise.resolve());
    const { fixture } = await render({ load, sendTrial });
    const page = fixture.componentInstance;
    page.phraseSource.set('published');
    fixture.detectChanges();
    await page.sendTrial();
    expect(sendTrial.mock.calls[0]?.slice(0, 2)).toEqual([
      TEMPLATE,
      { locale: 'fr', source: 'published' },
    ]);
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
