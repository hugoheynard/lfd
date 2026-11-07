import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { MailEditorListItem } from '@lfd/mail-blocks';
import { describe, expect, it, vi } from 'vitest';

import { MailEditorService } from '../../data/mail-editor.service';
import { MailSpacePage } from './mail-space-page';

const ORDER_PLACED: MailEditorListItem = {
  template: 'customer.order-placed',
  audience: 'customer',
  family: 'order',
  charter: 'lfc',
  locales: ['fr'],
  published: null,
  hasDraft: false,
};
const ALERT: MailEditorListItem = {
  template: 'staff.account-alert',
  audience: 'team',
  family: 'team',
  charter: 'internal',
  locales: ['fr'],
  published: null,
  hasDraft: true,
};

async function setup(space: string, list: () => Promise<unknown>) {
  const calls = { list: vi.fn(list) };
  TestBed.configureTestingModule({
    imports: [MailSpacePage],
    providers: [provideRouter([]), { provide: MailEditorService, useValue: calls }],
  });
  const fixture = TestBed.createComponent(MailSpacePage);
  fixture.componentRef.setInput('space', space);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { element: fixture.nativeElement as HTMLElement, calls };
}

describe('MailSpacePage — un espace d’e-mails', () => {
  it('liste les e-mails de SON espace, les internes sous « Interne »', async () => {
    const { element } = await setup('lfd', () =>
      Promise.resolve({ mails: [ORDER_PLACED, ALERT], copyPendingCount: 0 }),
    );
    expect(element.textContent).toContain('La Folie Douce — équipe');
    expect(element.querySelector('[data-template="customer.order-placed"]')).toBeNull();
    const alert = element.querySelector<HTMLAnchorElement>('[data-template="staff.account-alert"]');
    expect(alert?.getAttribute('href')).toBe('/emails/staff.account-alert');
    expect(alert?.textContent).toContain('Brouillon');
    expect(element.querySelector('[data-group="internal"]')).not.toBeNull();
  });

  it('revient à la liste des espaces et mène à sa charte', async () => {
    const { element } = await setup('lfc', () =>
      Promise.resolve({ mails: [ORDER_PLACED], copyPendingCount: 0 }),
    );
    expect(element.querySelector('fold-back-link a')?.getAttribute('href')).toBe('/emails');
    expect(element.querySelector('[data-charter]')?.getAttribute('href')).toBe(
      '/emails/espaces/lfc/charte',
    );
  });

  it('dit qu’un espace sans e-mail n’en a aucun', async () => {
    const { element } = await setup('lfc', () =>
      Promise.resolve({ mails: [ALERT], copyPendingCount: 0 }),
    );
    expect(element.textContent).toContain('Aucun e-mail');
  });

  it('refuse un segment qui n’est pas un espace, sans lire la liste', async () => {
    const { element, calls } = await setup('ailleurs', () =>
      Promise.resolve({ mails: [], copyPendingCount: 0 }),
    );
    expect(calls.list).not.toHaveBeenCalled();
    expect(element.querySelector('fold-empty-state')?.getAttribute('tone')).toBe('alert');
    expect(element.textContent).toContain('« ailleurs » n’est pas un espace d’e-mails.');
  });

  it('dit l’échec de lecture', async () => {
    const { element } = await setup('lfc', () => Promise.reject(new Error('boom')));
    expect(element.querySelector('fold-empty-state')?.getAttribute('tone')).toBe('alert');
  });
});
