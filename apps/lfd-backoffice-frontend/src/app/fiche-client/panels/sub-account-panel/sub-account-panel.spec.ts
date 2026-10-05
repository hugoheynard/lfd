import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import type { CreateSubAccountPayload } from '@lfd/contracts';
import { FoldInputComponent, FoldPanelRef, FoldViewToggleComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { AdminCompanyHierarchyService } from '../../../comptes-clients/admin-company-hierarchy.service';
import { NotifyService } from '../../../notify.service';
import { SubAccountPanel } from './sub-account-panel';

interface Wire {
  readonly sent: CreateSubAccountPayload[];
  refuse: HttpErrorResponse | null;
  readonly closed: (string | undefined)[];
  readonly navigated: unknown[][];
}

function boot(): { fixture: ComponentFixture<SubAccountPanel>; wire: Wire } {
  const wire: Wire = { sent: [], refuse: null, closed: [], navigated: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: FoldPanelRef, useValue: new FoldPanelRef<string>(1, (r) => wire.closed.push(r)) },
      { provide: NotifyService, useValue: { success: () => undefined } },
      {
        provide: Router,
        useValue: {
          navigate: (commands: unknown[]) => {
            wire.navigated.push(commands);
            return Promise.resolve(true);
          },
        },
      },
      {
        provide: AdminCompanyHierarchyService,
        useValue: {
          createSubAccount: (_parent: string, payload: CreateSubAccountPayload) => {
            wire.sent.push(payload);
            return wire.refuse === null ? Promise.resolve('child_1') : Promise.reject(wire.refuse);
          },
        } satisfies Partial<Record<keyof AdminCompanyHierarchyService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(SubAccountPanel);
  fixture.componentRef.setInput('data', {
    parentId: 'parent_1',
    parentName: 'Chalets du Lac',
    parentRaisonSociale: 'Chalets SAS',
    parentSiret: '73282932000074',
    parentVatNumber: 'FR12732829320',
  });
  fixture.detectChanges();
  return { fixture, wire };
}

function host(fixture: ComponentFixture<SubAccountPanel>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function choose(fixture: ComponentFixture<SubAccountPanel>, kind: 'site' | 'entity'): void {
  const toggle = fixture.debugElement.query(By.directive(FoldViewToggleComponent))
    .componentInstance as FoldViewToggleComponent;
  toggle.value.set(kind);
  fixture.detectChanges();
}

function name(fixture: ComponentFixture<SubAccountPanel>, value: string): void {
  const input = fixture.debugElement.query(By.directive(FoldInputComponent))
    .componentInstance as FoldInputComponent;
  input.value.set(value);
  fixture.detectChanges();
}

function submitButton(fixture: ComponentFixture<SubAccountPanel>): HTMLButtonElement {
  const buttons = host(fixture).querySelectorAll<HTMLButtonElement>('fold-panel-footer button');
  return buttons.item(buttons.length - 1);
}

async function settle(fixture: ComponentFixture<SubAccountPanel>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('SubAccountPanel', () => {
  it('rien à saisir avant d’avoir choisi : site, ou entité distincte', () => {
    const { fixture } = boot();
    expect(host(fixture).querySelector('[data-name]')).toBeNull();
    expect(host(fixture).querySelector('[data-issue]')?.textContent).toContain('Choisissez');
    expect(submitButton(fixture).disabled).toBe(true);
  });

  it('ne demande que le nom : ni identité, ni adresse, ni case de suivi', () => {
    const { fixture } = boot();
    choose(fixture, 'entity');
    expect(host(fixture).querySelector('lfd-company-identity-fields')).toBeNull();
    expect(host(fixture).querySelector('lfd-delivery-address-form')).toBeNull();
    expect(host(fixture).querySelector('fold-checkbox')).toBeNull();
    expect(host(fixture).querySelector('[data-issue]')?.textContent).toContain('nom');
  });

  it('un site montre l’identité du principal en lecture, et part en suivant la facturation', async () => {
    const { fixture, wire } = boot();
    choose(fixture, 'site');
    const billed = host(fixture).querySelector('[data-billed-as]')?.textContent ?? '';
    expect(billed).toContain('Facturé au nom de Chalets SAS');
    expect(billed).toContain('TVA FR12732829320');

    name(fixture, 'Chalet des Cimes');
    submitButton(fixture).click();
    await settle(fixture);

    expect(wire.sent[0]).toEqual({
      enseigne: 'Chalet des Cimes',
      raisonSociale: '',
      formeJuridique: '',
      siret: '',
      siren: '',
      vatNumber: '',
      follows: ['billing'],
    });
    expect(wire.closed).toEqual(['child_1']);
    expect(wire.navigated).toEqual([['/comptes-clients', 'child_1', 'informations']]);
  });

  it('une entité distincte part sans suivi, au nom seul', async () => {
    const { fixture, wire } = boot();
    choose(fixture, 'entity');
    name(fixture, 'Club Med Tignes');
    submitButton(fixture).click();
    await settle(fixture);

    expect(wire.sent[0]).toMatchObject({ enseigne: 'Club Med Tignes', follows: [] });
    expect(wire.sent[0]?.deliveryAddress).toBeUndefined();
  });

  it('un refus reste dans le panneau, tel quel, et on ne quitte pas la fiche', async () => {
    const { fixture, wire } = boot();
    wire.refuse = new HttpErrorResponse({
      status: 409,
      error: { message: 'Chalets du Lac est lui-même un sous-compte.' },
    });
    choose(fixture, 'site');
    name(fixture, 'Chalet des Cimes');
    submitButton(fixture).click();
    await settle(fixture);

    expect(host(fixture).querySelector('[data-refusal]')?.textContent).toContain(
      'Chalets du Lac est lui-même un sous-compte.',
    );
    expect(wire.closed).toEqual([]);
    expect(wire.navigated).toEqual([]);
  });
});
