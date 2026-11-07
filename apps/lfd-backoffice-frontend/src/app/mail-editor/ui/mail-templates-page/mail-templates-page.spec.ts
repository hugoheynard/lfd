import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { MailCharterSettings, MailEditorListItem, MailSpace } from '@lfd/mail-blocks';
import { HttpErrorResponse } from '@angular/common/http';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';

import { MailChartersService } from '../../data/mail-charters.service';
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

const SETTINGS: MailCharterSettings = {
  logo: null,
  colors: {
    page: '#f4f1ec',
    card: '#ffffff',
    text: '#1f1f1f',
    mutedText: '#5c5c5c',
    primary: '#1a3157',
    band: '#1a3157',
    border: '#e2ddd5',
  },
  darkColors: { page: '#111111', card: '#1c1c1c', text: '#eeeeee', border: '#333333' },
  headingFont: null,
  footer: {},
};

function charterOf(space: MailSpace, settings: MailCharterSettings = SETTINGS) {
  return Promise.resolve({ space, settings });
}

async function setup(
  list: () => Promise<unknown>,
  publishAll: () => Promise<unknown> = () => Promise.resolve({ publicationVersion: 4 }),
  permissions: readonly StaffPermission[] = ['mail_templates:write'],
  loadCharter: (space: MailSpace) => Promise<unknown> = (space) => charterOf(space),
) {
  const calls = { list: vi.fn(list), publishAll: vi.fn(publishAll) };
  const notify = { error: vi.fn(), success: vi.fn() };
  TestBed.configureTestingModule({
    imports: [MailTemplatesPage],
    providers: [
      provideRouter([]),
      { provide: MailEditorService, useValue: calls },
      { provide: MailChartersService, useValue: { load: vi.fn(loadCharter) } },
      { provide: NotifyService, useValue: notify },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission) => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(MailTemplatesPage);
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, calls, notify };
}

async function render(list: () => Promise<unknown>) {
  return (await setup(list)).element;
}

describe('MailTemplatesPage — les e-mails', () => {
  it('montre une carte par espace : son nom, ce qu’il couvre, ses e-mails et ses brouillons', async () => {
    const element = await render(() =>
      Promise.resolve({ mails: [ORDER_PLACED, ALERT], copyPendingCount: 0 }),
    );
    expect(element.querySelectorAll('fold-card')).toHaveLength(2);
    const lfc = element.querySelector('[data-space="lfc"]');
    expect(lfc?.textContent).toContain('La Folie Coffee — clients');
    expect(lfc?.textContent).toContain('clients de La Folie Coffee');
    expect(lfc?.querySelector('[data-count]')?.textContent).toContain('1 e-mail');
    expect(lfc?.querySelector('[data-drafts]')?.textContent).toContain('1 brouillon en attente');
    const lfd = element.querySelector('[data-space="lfd"]');
    expect(lfd?.textContent).toContain('La Folie Douce — équipe');
    expect(lfd?.querySelector('[data-count]')?.textContent).toContain('1 e-mail');
    expect(lfd?.querySelector('[data-drafts]')).toBeNull();
    // Les e-mails eux-mêmes sont dans l'espace, plus sur cette page.
    expect(element.querySelector('[data-template]')).toBeNull();
  });

  it('toute la carte mène à l’espace', async () => {
    const { fixture, element } = await setup(() =>
      Promise.resolve({ mails: [ALERT], copyPendingCount: 0 }),
    );
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    element.querySelector<HTMLElement>('[data-space="lfd"]')?.click();
    fixture.detectChanges();
    expect(navigate).toHaveBeenCalledWith(['/emails', 'espaces', 'lfd']);
  });

  it('montre les pastilles de la charte, et le logo seulement s’il est réglé', async () => {
    const element = (
      await setup(
        () => Promise.resolve({ mails: [], copyPendingCount: 0 }),
        undefined,
        undefined,
        (space) =>
          space === 'lfd'
            ? charterOf(space, {
                ...SETTINGS,
                logo: { src: 'https://img/lfd.png', alt: { fr: 'LFD' } },
              })
            : charterOf(space),
      )
    ).element;
    const lfc = element.querySelector('[data-space="lfc"]');
    expect(lfc?.querySelectorAll('[data-swatch]')).toHaveLength(4);
    expect(lfc?.querySelector('[data-logo]')).toBeNull();
    const logo = element.querySelector<HTMLImageElement>('[data-space="lfd"] [data-logo]');
    expect(logo?.getAttribute('src')).toBe('https://img/lfd.png');
    expect(logo?.getAttribute('alt')).toBe('LFD');
  });

  it('une charte illisible ôte l’aperçu de sa carte et le dit, la carte reste', async () => {
    const element = (
      await setup(
        () => Promise.resolve({ mails: [ORDER_PLACED], copyPendingCount: 0 }),
        undefined,
        undefined,
        (space) => (space === 'lfc' ? Promise.reject(new Error('boom')) : charterOf(space)),
      )
    ).element;
    expect(element.querySelector('[data-charter-error]')).not.toBeNull();
    expect(element.querySelector('[data-space="lfc"] [data-charter-preview]')).toBeNull();
    expect(element.querySelector('[data-space="lfd"] [data-charter-preview]')).not.toBeNull();
  });

  it('dit l’échec de lecture, sans prétendre qu’il n’y a aucun e-mail', async () => {
    const element = await render(() => Promise.reject(new Error('boom')));
    expect(element.querySelector('fold-empty-state')?.getAttribute('tone')).toBe('alert');
    expect(element.textContent).not.toContain('Aucun e-mail');
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
