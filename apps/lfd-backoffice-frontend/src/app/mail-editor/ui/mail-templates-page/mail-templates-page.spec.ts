import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { MailEditorListItem } from '@lfd/mail-blocks';
import { HttpErrorResponse } from '@angular/common/http';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';

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

async function setup(
  list: () => Promise<unknown>,
  publishAll: () => Promise<unknown> = () => Promise.resolve({ publicationVersion: 4 }),
  permissions: readonly StaffPermission[] = ['mail_templates:write'],
) {
  const calls = { list: vi.fn(list), publishAll: vi.fn(publishAll) };
  const notify = { error: vi.fn(), success: vi.fn() };
  TestBed.configureTestingModule({
    imports: [MailTemplatesPage],
    providers: [
      provideRouter([]),
      { provide: MailEditorService, useValue: calls },
      { provide: NotifyService, useValue: notify },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission) => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(MailTemplatesPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, calls, notify };
}

async function render(list: () => Promise<unknown>) {
  return (await setup(list)).element;
}

describe('MailTemplatesPage — les e-mails', () => {
  it('range les e-mails par espace, les internes sous « Interne », chacun menant à sa page', async () => {
    const element = await render(() =>
      Promise.resolve({ mails: [ORDER_PLACED, ALERT], copyPendingCount: 0 }),
    );
    expect(element.querySelectorAll('fold-page-section')).toHaveLength(2);
    expect(element.querySelector('[data-space="lfc"]')?.textContent).toContain(
      'La Folie Coffee — clients',
    );
    const lfd = element.querySelector('[data-space="lfd"]');
    expect(lfd?.textContent).toContain('La Folie Douce — équipe');
    expect(lfd?.querySelector('[data-template="staff.account-alert"]')).not.toBeNull();
    expect(lfd?.querySelector('[data-group="internal"]')).not.toBeNull();
    const link = element.querySelector<HTMLAnchorElement>(
      '[data-template="customer.order-placed"]',
    );
    expect(link?.textContent).toContain('Commande passée');
    expect(link?.getAttribute('href')).toBe('/emails/customer.order-placed');
    expect(element.textContent).toContain('Clients');
    expect(element.textContent).toContain('Interne');
  });

  it('mène chaque espace à sa charte', async () => {
    const element = await render(() =>
      Promise.resolve({ mails: [ORDER_PLACED], copyPendingCount: 0 }),
    );
    expect(element.querySelector('[data-charter="lfd"]')?.getAttribute('href')).toBe(
      '/emails/espaces/lfd/charte',
    );
    expect(element.querySelector('[data-charter="lfc"]')?.getAttribute('href')).toBe(
      '/emails/espaces/lfc/charte',
    );
  });

  it('dit l’échec de lecture, sans prétendre qu’il n’y a aucun e-mail', async () => {
    const element = await render(() => Promise.reject(new Error('boom')));
    expect(element.querySelector('fold-empty-state')?.getAttribute('tone')).toBe('alert');
    expect(element.textContent).not.toContain('Aucun e-mail');
  });

  it('dit qu’il n’y a aucun e-mail quand le serveur n’en déclare aucun', async () => {
    const element = await render(() => Promise.resolve({ mails: [], copyPendingCount: 0 }));
    expect(element.textContent).toContain('Aucun e-mail');
  });

  it('publie tous les e-mails en attente, puis relit la liste', async () => {
    const { fixture, element, calls, notify } = await setup(() =>
      Promise.resolve({ mails: [ORDER_PLACED], copyPendingCount: 3 }),
    );
    expect(element.querySelector('[data-copy-pending]')?.textContent).toContain(
      '3 modifications en attente',
    );
    expect(element.querySelector('[data-publish-all]')).not.toBeNull();
    await fixture.componentInstance.publishAll();
    expect(calls.publishAll).toHaveBeenCalledTimes(1);
    expect(calls.list).toHaveBeenCalledTimes(2);
    expect(notify.success).toHaveBeenCalledWith('Publié — version des textes 4.');
  });

  it('montre le refus « rien n’attend » tel que le serveur le dit', async () => {
    const refusal = new HttpErrorResponse({
      status: 409,
      error: { message: 'Aucune modification n’attend la publication.' },
    });
    const { fixture, element } = await setup(
      () => Promise.resolve({ mails: [ORDER_PLACED], copyPendingCount: 1 }),
      () => Promise.reject(refusal),
    );
    await fixture.componentInstance.publishAll();
    fixture.detectChanges();
    expect(element.querySelector('[data-publish-error]')?.textContent).toContain(
      'Aucune modification n’attend la publication.',
    );
  });

  it('sans le droit d’écrire, le compte sans le bouton', async () => {
    const { element } = await setup(
      () => Promise.resolve({ mails: [ORDER_PLACED], copyPendingCount: 2 }),
      undefined,
      ['mail_templates:read'],
    );
    expect(element.querySelector('[data-copy-pending]')).not.toBeNull();
    expect(element.querySelector('[data-publish-all]')).toBeNull();
  });
});
