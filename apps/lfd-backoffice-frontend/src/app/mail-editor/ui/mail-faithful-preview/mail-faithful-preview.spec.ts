import { TestBed } from '@angular/core/testing';
import {
  modelBlockId,
  type MailDocument,
  type MailDocumentPreviewPayload,
  type MailDocumentPreviewView,
} from '@lfd/mail-blocks';
import { describe, expect, it, vi } from 'vitest';

import { MailEditorService } from '../../data/mail-editor.service';
import { MailFaithfulPreview } from './mail-faithful-preview';

const TEMPLATE = 'customer.order-placed';
const DOCUMENT: MailDocument = {
  template: TEMPLATE,
  blocks: [{ id: modelBlockId('title'), kind: 'model', section: 'title' }],
};
const VIEW: MailDocumentPreviewView = {
  template: TEMPLATE,
  locale: 'fr',
  subject: 'Votre commande',
  html: '<p>Bonjour</p>',
  attachments: [
    { filename: 'facture.pdf', contentType: 'application/pdf', inline: false },
    { filename: 'logo.png', contentType: 'image/png', inline: true },
  ],
};

async function render(preview: (payload: MailDocumentPreviewPayload) => Promise<unknown>) {
  const spy = vi.fn((_template: string, payload: MailDocumentPreviewPayload) => preview(payload));
  TestBed.configureTestingModule({
    imports: [MailFaithfulPreview],
    providers: [{ provide: MailEditorService, useValue: { preview: spy } }],
  });
  const fixture = TestBed.createComponent(MailFaithfulPreview);
  fixture.componentRef.setInput('template', TEMPLATE);
  fixture.componentRef.setInput('locale', 'fr');
  fixture.componentRef.setInput('document', DOCUMENT);
  fixture.detectChanges();
  const element: HTMLElement = fixture.nativeElement;
  const click = async () => {
    await fixture.componentInstance.render();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { fixture, element, spy, click };
}

describe('MailFaithfulPreview', () => {
  it('ne demande rien au serveur avant que la page le demande, et dit où le demander', async () => {
    const { element, spy } = await render(() => Promise.resolve(VIEW));
    expect(spy).not.toHaveBeenCalled();
    expect(element.textContent).toContain('« Rendre l’aperçu », dans la barre d’outils');
    expect(element.querySelector('iframe')).toBeNull();
  });

  it('rend à la demande le document à l’écran, dans un cadre sans aucun drapeau', async () => {
    const { element, spy, click } = await render(() => Promise.resolve(VIEW));
    await click();
    expect(spy).toHaveBeenCalledWith(TEMPLATE, {
      locale: 'fr',
      source: 'draft',
      document: DOCUMENT,
    });
    const frame = element.querySelector('iframe');
    expect(frame?.getAttribute('sandbox')).toBe('');
    expect(element.textContent).toContain('Votre commande');
    expect(element.textContent).toContain('facture.pdf');
    expect(element.textContent).not.toContain('logo.png');
  });

  it('dit que l’écran a changé au lieu de se relancer', async () => {
    const { fixture, element, spy, click } = await render(() => Promise.resolve(VIEW));
    await click();
    expect(element.querySelector('[data-stale]')).toBeNull();
    fixture.componentRef.setInput('document', { ...DOCUMENT, blocks: [] });
    fixture.detectChanges();
    expect(element.querySelector('[data-stale]')).not.toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('rend le cas choisi, et dit qu’un autre cas a été choisi depuis', async () => {
    const { fixture, element, spy, click } = await render(() => Promise.resolve(VIEW));
    fixture.componentRef.setInput('caseId', 'due');
    await click();
    expect(spy).toHaveBeenCalledWith(TEMPLATE, {
      locale: 'fr',
      source: 'draft',
      document: DOCUMENT,
      caseId: 'due',
    });
    fixture.componentRef.setInput('caseId', 'account');
    fixture.detectChanges();
    expect(element.querySelector('[data-stale]')).not.toBeNull();
  });

  it('rend les phrases publiées quand la page les choisit, et le dit', async () => {
    const { fixture, element, spy, click } = await render(() => Promise.resolve(VIEW));
    fixture.componentRef.setInput('source', 'published');
    await click();
    expect(spy).toHaveBeenCalledWith(TEMPLATE, {
      locale: 'fr',
      source: 'published',
      document: DOCUMENT,
    });
    expect(element.textContent).toContain('les phrases publiées');
    fixture.componentRef.setInput('source', 'draft');
    fixture.detectChanges();
    expect(element.querySelector('[data-stale]')).not.toBeNull();
  });

  it('montre l’échec du premier rendu, avec « Réessayer »', async () => {
    const { element, click } = await render(() => Promise.reject(new Error('boom')));
    await click();
    const empty = element.querySelector('fold-empty-state');
    expect(empty?.getAttribute('tone')).toBe('alert');
    expect(element.querySelector('iframe')).toBeNull();
  });

  it('passe en vue téléphone et en sombre sans redemander le rendu, cadre toujours sans drapeau', async () => {
    const { fixture, element, spy, click } = await render(() => Promise.resolve(VIEW));
    await click();
    expect(fixture.componentInstance.rendered()).toBe(true);
    fixture.componentRef.setInput('device', 'phone');
    fixture.componentRef.setInput('scheme', 'dark');
    fixture.detectChanges();
    const frame = element.querySelector<HTMLIFrameElement>('iframe');
    expect(frame?.classList.contains('fp-frame--phone')).toBe(true);
    expect(frame?.style.colorScheme).toBe('dark');
    expect(frame?.getAttribute('sandbox')).toBe('');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
