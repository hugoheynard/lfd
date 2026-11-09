import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { MailPreferencesService } from '../../data/mail-preferences.service';
import { MailUnsubscribeAddressPanel } from './mail-unsubscribe-address-panel';

type Exposed = MailUnsubscribeAddressPanel & {
  address: { set(value: string): void };
  submit(event: Event): Promise<void>;
  close(): void;
};

async function setup(unsubscribeAddress: (space: string, address: string) => Promise<void>) {
  const closed: unknown[] = [];
  TestBed.configureTestingModule({
    imports: [MailUnsubscribeAddressPanel],
    providers: [
      { provide: MailPreferencesService, useValue: { unsubscribeAddress } },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (result) => closed.push(result)) },
    ],
  });
  const fixture = TestBed.createComponent(MailUnsubscribeAddressPanel);
  fixture.detectChanges();
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return {
    component: fixture.componentInstance as Exposed,
    element: fixture.nativeElement as HTMLElement,
    settle,
    closed,
  };
}

describe('MailUnsubscribeAddressPanel — désinscrire une adresse (C4)', () => {
  it('envoie l’espace et l’adresse rognée, le dit, et le signale à la page en fermant', async () => {
    const unsubscribeAddress = vi.fn(() => Promise.resolve());
    const { component, element, settle, closed } = await setup(unsubscribeAddress);
    component.address.set('  claire@halles.fr ');
    await component.submit(new Event('submit'));
    await settle();
    expect(unsubscribeAddress).toHaveBeenCalledWith('lfc', 'claire@halles.fr');
    expect(element.querySelector('[data-done]')).not.toBeNull();
    component.close();
    expect(closed).toEqual(['changed']);
  });

  it('n’envoie rien sans adresse, et dit le refus du serveur tel quel', async () => {
    const unsubscribeAddress = vi.fn(() =>
      Promise.reject(
        new HttpErrorResponse({ status: 400, error: { message: 'Ce n’est pas une adresse.' } }),
      ),
    );
    const { component, element, settle, closed } = await setup(unsubscribeAddress);
    await component.submit(new Event('submit'));
    expect(unsubscribeAddress).not.toHaveBeenCalled();
    component.address.set('claire');
    await component.submit(new Event('submit'));
    await settle();
    expect(element.querySelector('[data-error]')?.textContent).toContain(
      'Ce n’est pas une adresse',
    );
    component.close();
    expect(closed).toEqual([undefined]);
  });
});
