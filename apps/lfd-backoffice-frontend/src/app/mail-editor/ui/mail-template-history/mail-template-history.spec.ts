import { TestBed } from '@angular/core/testing';
import type { MailDocumentHistoryView } from '@lfd/mail-blocks';
import { describe, expect, it, vi } from 'vitest';

import { MailEditorService } from '../../data/mail-editor.service';
import { MailTemplateHistory } from './mail-template-history';

const TEMPLATE = 'customer.order-placed';

async function render(history: () => Promise<MailDocumentHistoryView>) {
  const spy = vi.fn((_template: string) => history());
  TestBed.configureTestingModule({
    imports: [MailTemplateHistory],
    providers: [{ provide: MailEditorService, useValue: { history: spy } }],
  });
  const fixture = TestBed.createComponent(MailTemplateHistory);
  fixture.componentRef.setInput('template', TEMPLATE);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, spy };
}

describe('MailTemplateHistory', () => {
  it('liste les versions, la plus récente en tête, celle en service nommée', async () => {
    const { fixture, element } = await render(() =>
      Promise.resolve({
        template: TEMPLATE,
        versions: [
          { version: 2, at: '2026-11-07T10:00:00.000Z', staffId: 'stf_2', current: true },
          { version: 1, at: '2026-11-06T10:00:00.000Z', staffId: 'stf_1', current: false },
        ],
        retracted: null,
      }),
    );
    const nodes = fixture.componentInstance.nodes();
    expect(nodes.map((node) => node.key)).toEqual(['2', '1']);
    expect(nodes[0]?.label).toContain('en service');
    expect(nodes[1]?.label).not.toContain('en service');
    expect(element.querySelector('[data-versions]')).not.toBeNull();
  });

  it('dit qu’un e-mail n’a jamais été publié, et le dernier retour au modèle d’origine', async () => {
    const { element } = await render(() =>
      Promise.resolve({
        template: TEMPLATE,
        versions: [],
        retracted: { at: '2026-11-07T10:00:00.000Z', staffId: 'stf_1' },
      }),
    );
    expect(element.querySelector('fold-empty-state')?.textContent).toContain('Jamais publié');
    expect(element.querySelector('[data-retracted]')?.textContent).toContain('stf_1');
  });

  it('se relit quand la page le demande', async () => {
    const { fixture, spy } = await render(() =>
      Promise.resolve({ template: TEMPLATE, versions: [], retracted: null }),
    );
    fixture.componentRef.setInput('refresh', 1);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('dit l’échec de lecture', async () => {
    const { element } = await render(() => Promise.reject(new Error('boom')));
    expect(element.querySelector('fold-empty-state')?.getAttribute('tone')).toBe('alert');
  });
});
