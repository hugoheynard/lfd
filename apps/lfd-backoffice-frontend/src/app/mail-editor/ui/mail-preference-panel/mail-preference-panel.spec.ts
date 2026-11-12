import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type {
  MailPreferenceDetailView,
  MailPreferenceRecipientView,
  StaffPermission,
} from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { MailPreferencesService } from '../../data/mail-preferences.service';
import { MailPreferencePanel } from './mail-preference-panel';

const AT = new Date().toISOString();
const DETAIL: MailPreferenceDetailView = {
  id: 'pref_1',
  space: 'lfc',
  status: 'accepted',
  recipient: 'c•••@halles.fr',
  origin: 'direct',
  place: 'order',
  requestedAt: AT,
  confirmedAt: AT,
  unsubscribedAt: null,
  unsubscribedSource: null,
  proof: { textVersion: 'society.v1', locale: 'it', place: 'order', ref: 'order_1' },
};
const RECIPIENT: MailPreferenceRecipientView = {
  id: 'pref_1',
  recipient: 'claire@halles.fr',
  revealedUntil: AT,
};

async function setup(
  api: Partial<Record<keyof MailPreferencesService, unknown>>,
  permissions: readonly StaffPermission[] = ['mail_sends:read', 'mail_sends:write'],
) {
  const closed: unknown[] = [];
  TestBed.configureTestingModule({
    imports: [MailPreferencePanel],
    providers: [
      { provide: MailPreferencesService, useValue: api },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (result) => closed.push(result)) },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission) => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(MailPreferencePanel);
  fixture.componentRef.setInput('data', { id: 'pref_1' });
  const settle = async () => {
    for (let pass = 0; pass < 3; pass += 1) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  };
  await settle();
  return { element: fixture.nativeElement as HTMLElement, settle, closed };
}

const click = (element: HTMLElement, selector: string): void =>
  element.querySelector<HTMLButtonElement>(selector)?.click();

describe('MailPreferencePanel — une ligne des désinscriptions et accords (C4)', () => {
  it('montre la preuve de l’accord, l’adresse masquée', async () => {
    const { element } = await setup({ detail: vi.fn(() => Promise.resolve(DETAIL)) });
    const proof = element.querySelector('[data-proof]')?.textContent ?? '';
    expect(proof).toContain('society.v1');
    expect(proof).toContain('it');
    expect(proof).toContain('Commande');
    expect(proof).toContain('order_1');
    expect(element.textContent).toContain('c•••@halles.fr');
    expect(element.textContent).not.toContain('claire@halles.fr');
  });

  it('« Afficher l’adresse » révèle puis montre l’adresse', async () => {
    const revealRecipient = vi.fn(() => Promise.resolve(RECIPIENT));
    const { element, settle } = await setup({
      detail: vi.fn(() => Promise.resolve(DETAIL)),
      revealRecipient,
    });
    click(element, '[data-reveal]');
    await settle();
    expect(revealRecipient).toHaveBeenCalledWith('pref_1', expect.any(String));
    expect(element.querySelector('[data-recipient]')?.textContent).toBe('claire@halles.fr');
  });

  it('le plafond du serveur s’affiche tel quel', async () => {
    const refused = await setup({
      detail: vi.fn(() => Promise.resolve(DETAIL)),
      revealRecipient: vi.fn(() =>
        Promise.reject(
          new HttpErrorResponse({ status: 409, error: { message: 'Trente consultations.' } }),
        ),
      ),
    });
    click(refused.element, '[data-reveal]');
    await refused.settle();
    expect(refused.element.querySelector('[data-reveal-error]')?.textContent).toContain(
      'Trente consultations',
    );
  });

  it('désinscrit après confirmation, relit la ligne, et le dit à la page en fermant', async () => {
    const unsubscribe = vi.fn(() => Promise.resolve());
    const detail = vi
      .fn<() => Promise<MailPreferenceDetailView>>()
      .mockResolvedValueOnce(DETAIL)
      .mockResolvedValueOnce({
        ...DETAIL,
        status: 'unsubscribed',
        unsubscribedAt: AT,
        unsubscribedSource: 'staff',
      });
    const { element, settle, closed } = await setup({ detail, unsubscribe });

    click(element, '[data-unsubscribe]');
    await settle();
    expect(unsubscribe).not.toHaveBeenCalled();
    expect(element.querySelector('[data-confirm-unsubscribe]')?.textContent).toContain(
      'Seul le client pourra se réinscrire',
    );
    click(element, '[data-confirm]');
    await settle();

    expect(unsubscribe).toHaveBeenCalledWith('pref_1');
    expect(element.textContent).toContain('Le staff, à la demande du client');
    expect(element.querySelector('[data-unsubscribe]')).toBeNull();
    click(element, 'fold-panel-footer button');
    expect(closed).toEqual(['changed']);
  });

  it('ne propose pas de désinscrire sans `mail_sends:write`', async () => {
    const readOnly = await setup({ detail: vi.fn(() => Promise.resolve(DETAIL)) }, [
      'mail_sends:read',
    ]);
    expect(readOnly.element.querySelector('[data-unsubscribe]')).toBeNull();
  });

  it('ne propose rien sur une ligne déjà désinscrite, et jamais de réinscrire', async () => {
    const done = await setup({
      detail: vi.fn(() =>
        Promise.resolve({
          ...DETAIL,
          status: 'unsubscribed' as const,
          unsubscribedSource: 'link' as const,
        }),
      ),
    });
    expect(done.element.querySelector('[data-unsubscribe]')).toBeNull();
    const buttons = [...done.element.querySelectorAll('button')].map((b) => b.textContent ?? '');
    expect(buttons.some((label) => /inscrire/iu.test(label))).toBe(false);
  });

  it('une adresse effacée n’a rien à afficher', async () => {
    const { element } = await setup({
      detail: vi.fn(() =>
        Promise.resolve({
          ...DETAIL,
          recipient: null,
          status: 'unsubscribed' as const,
          proof: null,
        }),
      ),
    });
    expect(element.textContent).toContain('Adresse effacée');
    expect(element.querySelector('[data-reveal]')).toBeNull();
    expect(element.querySelector('[data-no-proof]')).not.toBeNull();
  });
});
