import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { MailSendListItemView, StaffPermission } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { MailSendsService } from '../../data/mail-sends.service';
import { MailSendsPage } from './mail-sends-page';

const row = (id: string, template = 'customer.order-placed'): MailSendListItemView => ({
  id,
  template,
  space: 'lfc',
  recipient: 'c•••@halles.fr',
  state: 'accepted',
  delivery: null,
  requestedAt: new Date().toISOString(),
  problem: false,
  subjects: [],
});

async function setup(
  api: Partial<Record<keyof MailSendsService, unknown>>,
  permissions: readonly StaffPermission[] = ['mail_sends:read', 'mail_templates:read'],
  query: Readonly<Record<string, string>> = {},
) {
  const open = vi.fn();
  TestBed.configureTestingModule({
    imports: [MailSendsPage],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
      },
      { provide: MailSendsService, useValue: api },
      { provide: FoldPanelHostService, useValue: { open } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission) => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(MailSendsPage);
  const settle = async () => {
    for (let pass = 0; pass < 3; pass += 1) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  };
  await settle();
  const element = fixture.nativeElement as HTMLElement;
  const typeAddress = (value: string) => {
    const input = element.querySelector<HTMLInputElement>('[data-search-address] input');
    if (input === null) throw new Error('champ absent');
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  return { element, settle, open, typeAddress };
}

describe('MailSendsPage — le suivi des envois', () => {
  it('liste, puis « Charger plus » ajoute la page suivante par le curseur', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [row('m1')], nextCursor: 'c1' })
      .mockResolvedValueOnce({ items: [row('m2', 'customer.order-ready')], nextCursor: null });
    const { element, settle } = await setup({ list });
    expect(element.textContent).toContain('Commande passée');
    element
      .querySelector<HTMLButtonElement>('[data-load-more] button, button[data-load-more]')
      ?.click();
    await settle();
    expect(list).toHaveBeenLastCalledWith(expect.anything(), 'c1');
    expect(element.textContent).toContain('Commande prête');
    expect(element.querySelector('[data-load-more]')).toBeNull();
  });

  it('un échec de lecture le dit, sans liste vide qui mente', async () => {
    const { element } = await setup({ list: vi.fn().mockRejectedValue(new Error('x')) });
    expect(element.textContent).toContain('Les envois n’ont pas pu être lus');
  });

  it('la recherche remplace la liste par un résultat figé, puis on revient', async () => {
    const searchByRecipient = vi.fn().mockResolvedValue({
      id: 's1',
      searchedAt: new Date().toISOString(),
      readableUntil: new Date().toISOString(),
      items: [row('m9', 'customer.order-ready')],
    });
    const { element, settle, typeAddress } = await setup({
      list: vi.fn().mockResolvedValue({ items: [row('m1')], nextCursor: null }),
      searchByRecipient,
    });
    typeAddress('claire@halles.fr');
    await settle();
    element.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(searchByRecipient).toHaveBeenCalledWith('claire@halles.fr');
    expect(element.querySelector('[data-search-banner]')?.textContent).toContain('figés à');
    expect(element.textContent).toContain('Commande prête');
    expect(element.textContent).not.toContain('Commande passée');
    element.querySelector<HTMLButtonElement>('[data-search-banner] button')?.click();
    await settle();
    expect(element.querySelector('[data-search-banner]')).toBeNull();
    expect(element.textContent).toContain('Commande passée');
  });

  it('le plafond de la recherche s’affiche tel quel, la liste reste', async () => {
    const { element, settle, typeAddress } = await setup({
      list: vi.fn().mockResolvedValue({ items: [row('m1')], nextCursor: null }),
      searchByRecipient: vi.fn().mockRejectedValue(
        new HttpErrorResponse({
          status: 409,
          error: { message: 'Plafond atteint pour l’heure.' },
        }),
      ),
    });
    typeAddress('claire@halles.fr');
    await settle();
    element.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(element.querySelector('[data-search-error]')?.textContent).toContain('Plafond atteint');
    expect(element.textContent).toContain('Commande passée');
  });

  it('sans le droit des modèles, pas de retour vers Email Templates (Hugo, 2026-11-08)', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const withTemplates = await setup({ list });
    expect(withTemplates.element.querySelector('fold-back-link')).not.toBeNull();

    TestBed.resetTestingModule();
    const sendsOnly = await setup({ list }, ['mail_sends:read']);
    expect(sendsOnly.element.querySelector('fold-back-link')).toBeNull();
  });

  it('ouvre d’emblée l’envoi nommé par `?envoi=`, l’adresse d’une fiche commande', async () => {
    const list = vi.fn(() => Promise.resolve({ items: [row('m1')], nextCursor: null }));
    const { open } = await setup({ list }, undefined, { envoi: 'm9' });
    expect(open).toHaveBeenCalledWith(expect.anything(), { data: { id: 'm9' } });
  });
});
