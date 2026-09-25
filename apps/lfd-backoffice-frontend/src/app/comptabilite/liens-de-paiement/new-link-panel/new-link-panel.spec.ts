import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import type { CreatedPaymentLink, CreatePaymentLinkPayload } from '@lfd/contracts';

import type { AdminCompany } from '../../../comptes-clients/admin-company';
import { AdminCompaniesService } from '../../../comptes-clients/admin-companies.service';
import { NotifyService } from '../../../notify.service';
import { PaymentLinksService } from '../../payment-links.service';
import { NewLinkPanel } from './new-link-panel';

/**
 * Le montant saisi en euros part en centimes ENTIERS ; une saisie plus fine que
 * le centime n'est pas envoyée. Un refus du serveur (le plafond) reste dans le
 * panneau, mot pour mot. Une fois créé, l'URL s'affiche, et fermer dit `true`.
 */

class FakeApi {
  calls: CreatePaymentLinkPayload[] = [];
  refuse: unknown = null;

  createLink(payload: CreatePaymentLinkPayload): Promise<CreatedPaymentLink> {
    if (this.refuse !== null) {
      return Promise.reject(this.refuse);
    }
    this.calls.push(payload);
    return Promise.resolve({ id: 'l1', url: 'https://checkout.stripe.com/c/pay/cs_1' });
  }
}

const COMPANIES = [
  { id: 'c1', raisonSociale: 'Boulangerie du Lac SAS', enseigne: 'Le Lac' },
] as const satisfies readonly Pick<AdminCompany, 'id' | 'raisonSociale' | 'enseigne'>[];

interface Rendered {
  readonly fixture: ComponentFixture<NewLinkPanel>;
  readonly closedWith: (boolean | undefined)[];
}

async function render(api: FakeApi): Promise<Rendered> {
  const closedWith: (boolean | undefined)[] = [];
  TestBed.configureTestingModule({
    imports: [NewLinkPanel],
    providers: [
      { provide: PaymentLinksService, useValue: api },
      { provide: AdminCompaniesService, useValue: { list: () => Promise.resolve(COMPANIES) } },
      { provide: NotifyService, useValue: { success: () => undefined } },
      {
        provide: FoldPanelRef,
        useValue: new FoldPanelRef<boolean>(1, (result) => closedWith.push(result)),
      },
    ],
  });
  const fixture = TestBed.createComponent(NewLinkPanel);
  fixture.componentRef.setInput('data', { maxCents: 50_000 });
  await settle(fixture);
  return { fixture, closedWith };
}

async function settle(fixture: ComponentFixture<NewLinkPanel>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

const text = (fixture: ComponentFixture<NewLinkPanel>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

function button(fixture: ComponentFixture<NewLinkPanel>, label: string): HTMLButtonElement {
  const all = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button');
  const found = Array.from(all).find((b) => b.textContent?.trim() === label);
  if (found === undefined) {
    throw new Error(`bouton « ${label} » introuvable`);
  }
  return found;
}

async function fill(
  fixture: ComponentFixture<NewLinkPanel>,
  amount: string,
  label: string,
): Promise<void> {
  fixture.debugElement.query(By.css('fold-listbox')).triggerEventHandler('valueChange', 'c1');
  const inputs = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>(
    'fold-input input',
  );
  const values = [amount, label];
  inputs.forEach((input, index) => {
    input.value = values[index] ?? '';
    input.dispatchEvent(new Event('input'));
  });
  await settle(fixture);
}

describe('NewLinkPanel', () => {
  it('annonce le plafond en vigueur', async () => {
    const { fixture } = await render(new FakeApi());
    expect(text(fixture)).toMatch(/Plafond en vigueur : 500,00\s€/u);
  });

  it('convertit les euros saisis en centimes entiers', async () => {
    const api = new FakeApi();
    const { fixture } = await render(api);

    await fill(fixture, '125,50', '  Régularisation août  ');
    button(fixture, 'Créer le lien').click();
    await settle(fixture);

    expect(api.calls).toEqual([
      { companyId: 'c1', amountCents: 12_550, label: 'Régularisation août' },
    ]);
  });

  it('une saisie plus fine que le centime n’est pas envoyée', async () => {
    const { fixture } = await render(new FakeApi());

    await fill(fixture, '12,345', 'Régularisation');

    expect(button(fixture, 'Créer le lien').disabled).toBe(true);
    expect(text(fixture)).toContain('au centime près');
  });

  it('un libellé de plus de 140 caractères n’est pas envoyé', async () => {
    const { fixture } = await render(new FakeApi());

    await fill(fixture, '10', 'x'.repeat(141));

    expect(button(fixture, 'Créer le lien').disabled).toBe(true);
  });

  it('le refus du serveur reste dans le panneau, mot pour mot', async () => {
    const api = new FakeApi();
    api.refuse = { status: 409, error: { message: 'Le plafond d’un lien est de 500,00 €.' } };
    const { fixture, closedWith } = await render(api);

    await fill(fixture, '900', 'Régularisation');
    button(fixture, 'Créer le lien').click();
    await settle(fixture);

    expect(text(fixture)).toContain('Le plafond d’un lien est de 500,00 €.');
    expect(closedWith).toEqual([]);
  });

  it('une fois créé, montre l’URL, et fermer dit à l’appelant de relire', async () => {
    const { fixture, closedWith } = await render(new FakeApi());

    await fill(fixture, '10', 'Régularisation');
    button(fixture, 'Créer le lien').click();
    await settle(fixture);

    expect(text(fixture)).toContain('https://checkout.stripe.com/c/pay/cs_1');
    button(fixture, 'Fermer').click();
    expect(closedWith).toEqual([true]);
  });
});
