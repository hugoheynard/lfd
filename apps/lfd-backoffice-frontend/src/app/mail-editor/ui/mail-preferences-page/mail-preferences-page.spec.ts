import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { MailPreferenceListItemView, StaffPermission } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { MailPreferencesService } from '../../data/mail-preferences.service';
import type { MailPreferenceFilters } from '../../rules/mail-preference-labels';
import { MailPreferencePanel } from '../mail-preference-panel/mail-preference-panel';
import { MailUnsubscribeAddressPanel } from '../mail-unsubscribe-address-panel/mail-unsubscribe-address-panel';
import { MailPreferencesPage } from './mail-preferences-page';

const row = (
  id: string,
  recipient: string | null = 'c•••@halles.fr',
): MailPreferenceListItemView => ({
  id,
  space: 'lfc',
  status: 'accepted',
  recipient,
  origin: 'direct',
  place: 'order',
  requestedAt: new Date().toISOString(),
  confirmedAt: new Date().toISOString(),
  unsubscribedAt: null,
  unsubscribedSource: null,
});

async function setup(
  api: Partial<Record<keyof MailPreferencesService, unknown>>,
  permissions: readonly StaffPermission[] = ['mail_sends:read', 'mail_templates:read'],
  closedWith: unknown = undefined,
) {
  const open = vi.fn(() => ({ closed: Promise.resolve(closedWith) }));
  TestBed.configureTestingModule({
    imports: [MailPreferencesPage],
    providers: [
      provideRouter([]),
      { provide: MailPreferencesService, useValue: api },
      { provide: FoldPanelHostService, useValue: { open } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission) => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(MailPreferencesPage);
  const settle = async () => {
    for (let pass = 0; pass < 3; pass += 1) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  };
  await settle();
  const component = fixture.componentInstance as MailPreferencesPage & {
    change(patch: Partial<MailPreferenceFilters>): void;
    address: { set(value: string): void };
    searchAddress(event: Event): Promise<void>;
  };
  return { element: fixture.nativeElement as HTMLElement, settle, open, component };
}

describe('MailPreferencesPage — les désinscriptions et accords (C4)', () => {
  it('liste masquée sous les onglets du suivi, puis « Charger plus » par le curseur', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [row('pref_2')], nextCursor: 'pref_2' })
      .mockResolvedValueOnce({ items: [row('pref_1', null)], nextCursor: null });
    const { element, settle } = await setup({ list });
    expect(element.textContent).toContain('c•••@halles.fr');
    expect(element.textContent).toContain('Désinscriptions et accords');
    element.querySelector<HTMLButtonElement>('button[data-load-more]')?.click();
    await settle();
    expect(list).toHaveBeenLastCalledWith(expect.anything(), 'pref_2');
    expect(element.textContent).toContain('Adresse effacée');
    expect(element.querySelector('[data-load-more]')).toBeNull();
  });

  it('un filtre relit la liste avec ses critères', async () => {
    const list = vi.fn(() => Promise.resolve({ items: [], nextCursor: null }));
    const { settle, component } = await setup({ list });
    expect(list).toHaveBeenCalledWith({ space: null, status: null });
    component.change({ status: 'unsubscribed' });
    await settle();
    expect(list).toHaveBeenLastCalledWith({ space: null, status: 'unsubscribed' });
  });

  it('ouvre une ligne en panneau, et relit la liste quand elle a été désinscrite', async () => {
    const list = vi.fn(() => Promise.resolve({ items: [row('pref_1')], nextCursor: null }));
    const { element, settle, open } = await setup({ list }, undefined, 'changed');
    element.querySelector<HTMLElement>('tbody tr')?.click();
    await settle();
    expect(open).toHaveBeenCalledWith(MailPreferencePanel, { data: { id: 'pref_1' } });
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('« Désinscrire une adresse » demande `mail_sends:write`', async () => {
    const list = vi.fn(() => Promise.resolve({ items: [], nextCursor: null }));
    const readOnly = await setup({ list });
    expect(readOnly.element.querySelector('[data-unsubscribe-address]')).toBeNull();

    TestBed.resetTestingModule();
    const writer = await setup({ list }, ['mail_sends:read', 'mail_sends:write']);
    writer.element.querySelector<HTMLButtonElement>('button[data-unsubscribe-address]')?.click();
    await writer.settle();
    expect(writer.open).toHaveBeenCalledWith(MailUnsubscribeAddressPanel);
  });

  it('cherche une adresse dans le corps, montre le résultat figé, puis revient à la liste', async () => {
    const list = vi.fn(() => Promise.resolve({ items: [row('pref_2')], nextCursor: null }));
    const searchByAddress = vi.fn(() =>
      Promise.resolve({
        id: 'srch_1',
        searchedAt: new Date().toISOString(),
        readableUntil: new Date().toISOString(),
        items: [row('pref_9', 'z•••@halles.fr')],
      }),
    );
    const { element, settle, component } = await setup({ list, searchByAddress });
    component.address.set('zoe@halles.fr');
    await component.searchAddress(new Event('submit'));
    await settle();
    expect(searchByAddress).toHaveBeenCalledWith('zoe@halles.fr');
    expect(element.querySelector('[data-search-banner]')?.textContent).toContain('figés à');
    expect(element.textContent).toContain('z•••@halles.fr');
    expect(element.textContent).not.toContain('zoe@halles.fr');
    element.querySelector<HTMLButtonElement>('[data-search-banner] button')?.click();
    await settle();
    expect(element.querySelector('[data-search-banner]')).toBeNull();
    expect(element.textContent).toContain('c•••@halles.fr');
  });

  it('un registre illisible le dit, avec de quoi réessayer', async () => {
    const { element } = await setup({ list: vi.fn(() => Promise.reject(new Error('x'))) });
    expect(element.textContent).toContain('Le registre n’a pas pu être lu');
  });
});
