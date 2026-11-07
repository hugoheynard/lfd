import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { StaffPermission } from '@lfd/contracts';
import { modelBlockId, type MailEditorView } from '@lfd/mail-blocks';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { MailEditorService } from '../../data/mail-editor.service';
import { MailTemplatePage } from './mail-template-page';

const TEMPLATE = 'customer.order-placed';

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
    cases: [],
  };
}

async function render(
  api: Partial<Record<'load' | 'saveDraft' | 'preview', ReturnType<typeof vi.fn>>>,
  permissions: readonly StaffPermission[] = ['mail_templates:write'],
) {
  const notify = { error: vi.fn(), success: vi.fn() };
  TestBed.configureTestingModule({
    imports: [MailTemplatePage],
    providers: [
      provideRouter([]),
      { provide: MailEditorService, useValue: api },
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
});
