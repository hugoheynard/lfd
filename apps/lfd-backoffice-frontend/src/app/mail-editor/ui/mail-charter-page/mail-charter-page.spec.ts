import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { StaffPermission } from '@lfd/contracts';
import type { MailCharterSettings, MailCharterView } from '@lfd/mail-blocks';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { MailChartersService } from '../../data/mail-charters.service';
import { MailCharterPage } from './mail-charter-page';

const SETTINGS: MailCharterSettings = {
  logo: null,
  colors: {
    page: '#f4f1ea',
    card: '#ffffff',
    text: '#1a1a1a',
    mutedText: '#555555',
    primary: '#24448f',
    band: '#1a3157',
    border: '#dddddd',
  },
  darkColors: { page: '#111111', card: '#1c1c1c', text: '#f0f0f0', border: '#333333' },
  headingFont: null,
  footer: {},
};

const VIEW: MailCharterView = {
  space: 'lfd',
  templates: ['staff.invited', 'staff.account-alert', 'ops.deploy-check'],
  locales: ['fr'],
  settings: SETTINGS,
  source: 'draft',
  starting: SETTINGS,
  revision: 4,
  published: null,
  draft: { at: '2026-11-07T08:00:00.000Z', staffId: 's1' },
};

async function setup(
  space = 'lfd',
  permissions: readonly StaffPermission[] = ['mail_templates:write'],
) {
  const api = {
    load: vi.fn(() => Promise.resolve(VIEW)),
    history: vi.fn(() => Promise.resolve({ space: 'lfd', versions: [] })),
    preview: vi.fn(),
    saveDraft: vi.fn(() => Promise.resolve()),
    publish: vi.fn(() => Promise.resolve({ version: 1, publicationVersion: 9 })),
  };
  const notify = { error: vi.fn(), success: vi.fn() };
  TestBed.configureTestingModule({
    imports: [MailCharterPage],
    providers: [
      provideRouter([]),
      { provide: MailChartersService, useValue: api },
      { provide: NotifyService, useValue: notify },
      { provide: FoldPanelHostService, useValue: { open: vi.fn() } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission) => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(MailCharterPage);
  fixture.componentRef.setInput('space', space);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return {
    fixture,
    page: fixture.componentInstance,
    element: fixture.nativeElement as HTMLElement,
    api,
    notify,
  };
}

describe('MailCharterPage — la charte d’un espace', () => {
  it('lit la charte de l’espace et en dit le nom', async () => {
    const { element, api } = await setup();
    expect(api.load).toHaveBeenCalledWith('lfd');
    expect(element.textContent).toContain('La Folie Douce — équipe');
    expect(element.querySelector('[data-color="colors.text"]')).not.toBeNull();
    expect(element.querySelector('[data-color="darkColors.card"]')).not.toBeNull();
  });

  it('est l’onglet « Charte » de l’espace, et revient à la liste des espaces', async () => {
    const { element } = await setup();
    expect(element.querySelector('fold-back-link a')?.getAttribute('href')).toBe('/emails');
    const active = element.querySelector(
      'app-mail-space-tabs a[href="/emails/espaces/lfd/charte"]',
    );
    expect(active?.textContent).toContain('Charte');
  });

  it('refuse un espace inconnu sans rien demander au serveur', async () => {
    const { element, api } = await setup('internal');
    expect(api.load).not.toHaveBeenCalled();
    expect(element.querySelector('fold-empty-state')?.getAttribute('tone')).toBe('alert');
  });

  it('montre le refus de contraste sous la couleur, avant de publier, et retient la publication', async () => {
    const { fixture, page, element } = await setup();
    page.settings.set({ ...SETTINGS, colors: { ...SETTINGS.colors, text: '#dddddd' } });
    fixture.detectChanges();
    const field = element.querySelector('[data-color="colors.text"]');
    expect(field?.querySelector('[data-violation]')?.textContent).toContain('4,5:1');
    expect(element.querySelector('[data-violations]')).not.toBeNull();
    expect(element.querySelector('[data-contrast] [data-passes="false"]')?.textContent).toContain(
      ':1',
    );
    expect(page.canPublish()).toBe(false);
  });

  it('exige le texte de remplacement d’un logo choisi', async () => {
    const { fixture, page, element } = await setup();
    page.settings.set({ ...SETTINGS, logo: { src: 'https://cdn.example/logo.png', alt: {} } });
    fixture.detectChanges();
    expect(element.querySelector('[data-violation]')?.textContent).toContain(
      'texte de remplacement',
    );
  });

  it('dit, avant de publier, que tous les e-mails de l’espace changent, et combien', async () => {
    const { page } = await setup();
    expect(page.publishMessage()).toContain('tous les e-mails de l’espace');
    expect(page.publishMessage()).toContain('(3 e-mails)');
    expect(page.canPublish()).toBe(true);
  });

  it('enregistre la charte à l’écran à la révision lue, puis relit', async () => {
    const { page, api } = await setup();
    const next = { ...SETTINGS, footer: { fr: 'La Folie Douce, Paris' } };
    page.settings.set(next);
    expect(page.dirty()).toBe(true);
    expect(page.canPublish()).toBe(false);
    await page.save();
    expect(api.saveDraft).toHaveBeenCalledWith('lfd', { settings: next, expectedRevision: 4 });
    expect(api.load).toHaveBeenCalledTimes(2);
  });

  it('publie le brouillon enregistré à la révision lue', async () => {
    const { page, api, notify } = await setup();
    await page.publish();
    expect(api.publish).toHaveBeenCalledWith('lfd', { expectedRevision: 4 });
    expect(notify.success).toHaveBeenCalledWith('Charte publiée — version 1.');
  });

  it('retient une fois la sortie d’une charte modifiée', async () => {
    const { page } = await setup();
    expect(page.canLeave()).toBe(true);
    page.settings.set({ ...SETTINGS, footer: { fr: 'x' } });
    expect(page.canLeave()).toBe(false);
    expect(page.canLeave()).toBe(true);
  });

  it('sans le droit d’écrire, ni enregistrer ni publier', async () => {
    const { element } = await setup('lfd', ['mail_templates:read']);
    expect(element.querySelector('[data-save]')).toBeNull();
    expect(element.querySelector('[data-publish]')).toBeNull();
    expect(element.querySelector('[data-pick-logo]')).toBeNull();
  });
});
