import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { MailEditorListItem } from '@lfd/mail-blocks';
import { describe, expect, it, vi } from 'vitest';

import { MailEditorService } from '../../data/mail-editor.service';
import { MailTemplatesPage } from './mail-templates-page';

const ORDER_PLACED: MailEditorListItem = {
  template: 'customer.order-placed',
  audience: 'customer',
  family: 'order',
  charter: 'lfc',
  locales: ['fr', 'en', 'it'],
  published: null,
  hasDraft: true,
};
const ALERT: MailEditorListItem = {
  template: 'staff.account-alert',
  audience: 'team',
  family: 'team',
  charter: 'internal',
  locales: ['fr'],
  published: { version: 2, at: '2026-11-07T08:00:00.000Z', staffId: 's1' },
  hasDraft: false,
};

async function render(list: () => Promise<unknown>) {
  TestBed.configureTestingModule({
    imports: [MailTemplatesPage],
    providers: [provideRouter([]), { provide: MailEditorService, useValue: { list: vi.fn(list) } }],
  });
  const fixture = TestBed.createComponent(MailTemplatesPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('MailTemplatesPage — les e-mails', () => {
  it('range les e-mails par destinataire, chacun menant à sa page', async () => {
    const element = await render(() => Promise.resolve({ mails: [ORDER_PLACED, ALERT] }));
    expect(element.querySelectorAll('fold-page-section')).toHaveLength(2);
    const link = element.querySelector<HTMLAnchorElement>(
      '[data-template="customer.order-placed"]',
    );
    expect(link?.textContent).toContain('Commande passée');
    expect(link?.getAttribute('href')).toBe('/emails/customer.order-placed');
    expect(element.textContent).toContain('Clients');
    expect(element.textContent).toContain('Équipe');
  });

  it('dit l’échec de lecture, sans prétendre qu’il n’y a aucun e-mail', async () => {
    const element = await render(() => Promise.reject(new Error('boom')));
    expect(element.querySelector('fold-empty-state')?.getAttribute('tone')).toBe('alert');
    expect(element.textContent).not.toContain('Aucun e-mail');
  });

  it('dit qu’il n’y a aucun e-mail quand le serveur n’en déclare aucun', async () => {
    const element = await render(() => Promise.resolve({ mails: [] }));
    expect(element.textContent).toContain('Aucun e-mail');
  });
});
