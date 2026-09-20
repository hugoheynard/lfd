import { TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { FR } from '../../../copy/fr';
import { asRole, bootCard, matchMediaAt, openedPanel, TOMMEUSES } from '../../account.fixture';
import { UserAddPanel } from '../user-add-panel/user-add-panel';
import { UsersDeskCard } from './users-desk-card';

afterEach(() => {
  TestBed.inject(FoldPanelHostService).dismissAll();
  vi.unstubAllGlobals();
});

describe('UsersDeskCard', () => {
  it('compte tout le monde, détenteur compris, et porte la liste entière', () => {
    const el = bootCard(UsersDeskCard, [TOMMEUSES]).nativeElement as HTMLElement;

    expect(el.querySelector('.count')?.textContent).toContain('(2)');
    expect(el.querySelectorAll('app-users-list .holder').length).toBe(1);
    expect(el.querySelectorAll('app-users-list .person').length).toBe(1);
  });

  it('« Ajouter » ouvre le dialogue d’ajout, aux seuls rôles qui écrivent', () => {
    const reader = bootCard(UsersDeskCard, [asRole('orders')]).nativeElement as HTMLElement;
    expect(reader.querySelector('button.add')).toBeNull();

    vi.stubGlobal('matchMedia', matchMediaAt(false));
    const writer = bootCard(UsersDeskCard, [TOMMEUSES]).nativeElement as HTMLElement;
    const add = writer.querySelector<HTMLButtonElement>('button.add');
    expect(add?.textContent).toContain(FR.account.usersAdd);
    add?.click();

    expect(openedPanel()?.component).toBe(UserAddPanel);
    // Une saisie : dialogue centré au bureau (règle « Saisir », 2026-09-14).
    expect(openedPanel()?.side).toBe('center');
  });
});
