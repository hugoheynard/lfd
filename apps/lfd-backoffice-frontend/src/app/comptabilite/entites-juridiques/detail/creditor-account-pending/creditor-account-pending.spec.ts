import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { ConfirmCreditorAccountPayload, PendingCreditorAccountView } from '@lfd/contracts';
import { FoldInputComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../../auth/permissions.store';
import { LegalEntitiesService } from '../../../legal-entities.service';
import { CreditorAccountPending } from './creditor-account-pending';

/**
 * La modification du compte en attente : son auteur ne peut que l'annuler ;
 * un autre membre la confirme en RESSAISISSANT l'IBAN, et le champ ne se vide
 * qu'après le succès.
 */

const PENDING: PendingCreditorAccountView = {
  id: 'p1',
  last4: '0189',
  bic: 'BNPAFRPP',
  holder: 'Crazeativity',
  line1: 'Route de la Balme',
  line2: '',
  postalCode: '73150',
  city: 'Val d’Isère',
  countryCode: 'FR',
  proposedByStaffId: 'staff_author',
  proposedByName: 'Colette Martin',
  proposedAt: '2026-11-12T09:00:00.000Z',
};

interface Wire {
  confirms: { id: string; pendingId: string; payload: ConfirmCreditorAccountPayload }[];
  cancels: { id: string; pendingId: string }[];
  saved: { action: () => Promise<unknown>; said: string }[];
}

function boot(
  me: string,
  fail = false,
): { fixture: ComponentFixture<CreditorAccountPending>; wire: Wire } {
  const wire: Wire = { confirms: [], cancels: [], saved: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CreditorAccountPending],
    providers: [
      { provide: PermissionsStore, useValue: { identity: () => ({ id: me }) } },
      {
        provide: LegalEntitiesService,
        useValue: {
          confirmCreditorAccount: (
            id: string,
            pendingId: string,
            payload: ConfirmCreditorAccountPayload,
          ): Promise<void> => {
            wire.confirms.push({ id, pendingId, payload });
            return fail ? Promise.reject(new Error('refusé')) : Promise.resolve();
          },
          cancelPendingCreditorAccount: (id: string, pendingId: string): Promise<void> => {
            wire.cancels.push({ id, pendingId });
            return Promise.resolve();
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(CreditorAccountPending);
  fixture.componentRef.setInput('entityId', 'le1');
  fixture.componentRef.setInput('pending', PENDING);
  fixture.componentInstance.saved.subscribe((request) => wire.saved.push(request));
  fixture.detectChanges();
  return { fixture, wire };
}

function button(
  fixture: ComponentFixture<CreditorAccountPending>,
  label: string,
): HTMLButtonElement | undefined {
  return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((candidate) =>
    (candidate.textContent ?? '').includes(label),
  );
}

function ibanField(
  fixture: ComponentFixture<CreditorAccountPending>,
): FoldInputComponent | undefined {
  return fixture.debugElement.query(By.directive(FoldInputComponent))?.componentInstance as
    FoldInputComponent | undefined;
}

describe('CreditorAccountPending', () => {
  it('dit qui a proposé, quand, et le compte proposé par ses quatre derniers caractères', () => {
    const { fixture } = boot('staff_other');

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Colette Martin');
    expect(text).toContain('12 novembre 2026');
    expect(text).toContain('•••• 0189');
    expect(text).toContain('BNPAFRPP');
  });

  it('à son auteur : ni champ ni « Confirmer », seulement l’annulation', () => {
    const { fixture } = boot('staff_author');

    expect(ibanField(fixture)).toBeUndefined();
    expect(button(fixture, 'Confirmer')).toBeUndefined();
    expect(button(fixture, 'Annuler la modification')).toBeDefined();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('un autre membre');
  });

  it('à un autre membre : confirme avec l’IBAN ressaisi, nettoyé', async () => {
    const { fixture, wire } = boot('staff_other');
    expect(button(fixture, 'Confirmer')?.disabled).toBe(true);

    ibanField(fixture)?.value.set('  FR7630006000011234567890189 ');
    fixture.detectChanges();
    button(fixture, 'Confirmer')?.click();
    await wire.saved[0]?.action();
    fixture.detectChanges();

    expect(wire.confirms).toEqual([
      { id: 'le1', pendingId: 'p1', payload: { iban: 'FR7630006000011234567890189' } },
    ]);
    expect(ibanField(fixture)?.value()).toBe('');
  });

  it('un refus garde l’IBAN ressaisi', async () => {
    const { fixture, wire } = boot('staff_other', true);
    ibanField(fixture)?.value.set('FR7630006000011234567890189');
    fixture.detectChanges();

    button(fixture, 'Confirmer')?.click();
    await expect(wire.saved[0]?.action()).rejects.toThrow('refusé');

    expect(ibanField(fixture)?.value()).toBe('FR7630006000011234567890189');
  });

  it('annule la saisie désignée', async () => {
    const { fixture, wire } = boot('staff_author');

    button(fixture, 'Annuler la modification')?.click();
    await wire.saved[0]?.action();

    expect(wire.cancels).toEqual([{ id: 'le1', pendingId: 'p1' }]);
    expect(wire.saved[0]?.said).toBe('Modification du compte annulée.');
  });
});
