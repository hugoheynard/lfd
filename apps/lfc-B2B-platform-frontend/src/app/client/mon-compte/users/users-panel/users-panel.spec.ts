import { FoldPanelRef } from 'fold-ng';

import { FR } from '../../../copy/fr';
import { bootCard, TOMMEUSES } from '../../account.fixture';
import { UsersPanel } from './users-panel';

describe('UsersPanel', () => {
  it('porte la liste entière des interlocuteurs sous son titre', () => {
    const el = bootCard(
      UsersPanel,
      [TOMMEUSES],
      [{ provide: FoldPanelRef, useValue: new FoldPanelRef(1, () => undefined) }],
    ).nativeElement as HTMLElement;

    expect(el.querySelector('fold-panel-header')?.textContent).toContain(FR.account.sections.users);
    expect(el.querySelectorAll('app-users-list .holder').length).toBe(1);
    expect(el.querySelectorAll('app-users-list .person').length).toBe(1);
  });
});
