import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { BudgetCommitmentRequirementsView } from '@lfd/contracts';

import { ClientBudgetCommitment, type CommitmentStanding } from '../budget-commitment.service';
import { BudgetCommitmentFields } from './budget-commitment-fields';

const ARMY: BudgetCommitmentRequirementsView = {
  payerCompanyId: 'cmp_1',
  publicPayer: true,
  commitmentRequired: true,
  serviceCodeRequired: false,
  defaultServiceCode: 'SRV-01',
  currentCommitment: null,
};

/** Le service doublé : les exigences et la saisie, sans HTTP. */
function commitmentDouble(
  requirements: BudgetCommitmentRequirementsView | null,
  failed = false,
  standing: CommitmentStanding | null = null,
) {
  const number = signal('');
  const asked: string[] = [];
  return {
    asked,
    number,
    double: {
      requirements: signal(requirements),
      failed: signal(failed),
      standing: signal(standing),
      number,
      serviceCode: computed(() => requirements?.defaultServiceCode ?? ''),
      ensure: () => asked.push('ensure'),
      setNumber: (value: string) => number.set(value),
      setServiceCode: () => undefined,
    } satisfies Pick<
      ClientBudgetCommitment,
      | 'requirements'
      | 'failed'
      | 'standing'
      | 'number'
      | 'serviceCode'
      | 'ensure'
      | 'setNumber'
      | 'setServiceCode'
    >,
  };
}

async function render(
  requirements: BudgetCommitmentRequirementsView | null,
  failed = false,
  standing: CommitmentStanding | null = null,
) {
  const service = commitmentDouble(requirements, failed, standing);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: ClientBudgetCommitment, useValue: service.double }],
  });
  const fixture = TestBed.createComponent(BudgetCommitmentFields);
  fixture.detectChanges();
  await fixture.whenStable();
  return { host: fixture.nativeElement as HTMLElement, service, fixture };
}

const textOf = (host: HTMLElement, selector: string): string =>
  host.querySelector(selector)?.textContent?.replace(/\s+/g, ' ') ?? '';

describe('BudgetCommitmentFields (boutique)', () => {
  it('lit les exigences à l’ouverture, et dit le numéro exigé et où il se trouve', async () => {
    const { host, service } = await render(ARMY);

    expect(service.asked).toEqual(['ensure']);
    expect(textOf(host, '[data-budget-commitment-number]')).toContain('Exigé par votre organisme');
    expect(textOf(host, '[data-budget-commitment-number]')).toContain('bon de commande');
  });

  it('le code service se préremplit du défaut de la fiche', async () => {
    const { host } = await render(ARMY);

    expect(
      host.querySelector<HTMLInputElement>('[data-budget-commitment-service] input')?.value,
    ).toBe('SRV-01');
  });

  it('un numéro facultatif ne se dit pas exigé', async () => {
    const { host } = await render({ ...ARMY, commitmentRequired: false });

    expect(textOf(host, '[data-budget-commitment-number]')).not.toContain('Exigé');
  });

  it('la saisie va au service', async () => {
    const { host, service, fixture } = await render(ARMY);
    const input = host.querySelector<HTMLInputElement>('[data-budget-commitment-number] input');
    if (input === null) {
      throw new Error('champ du numéro introuvable');
    }
    input.value = '1300012345';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(service.number()).toBe('1300012345');
  });

  it('des exigences illisibles : l’échec est dit, les champs restent', async () => {
    const { host } = await render(null, true);

    expect(host.querySelector('[data-budget-commitment-unread]')).not.toBeNull();
    expect(host.querySelector('[data-budget-commitment-number] input')).not.toBeNull();
  });

  it('sans engagement en cours, ne dit rien de plus', async () => {
    const { host } = await render(ARMY);

    expect(host.querySelector('[data-budget-commitment-standing]')).toBeNull();
  });

  it('un engagement qui court dit jusqu’à quand', async () => {
    const { host } = await render(ARMY, false, {
      state: 'running',
      number: 'ENG-2026',
      endsOn: '2026-12-31',
    });

    expect(textOf(host, '[data-budget-commitment-standing]')).toBe(
      'Engagement n° ENG-2026 en cours jusqu’au 31 décembre 2026.',
    );
  });

  it('un engagement expiré dit qu’il a pris fin', async () => {
    const { host } = await render(ARMY, false, {
      state: 'ended',
      number: 'ENG-2026',
      endsOn: '2026-12-31',
    });

    expect(textOf(host, '[data-budget-commitment-standing]')).toBe(
      'L’engagement n° ENG-2026 a pris fin le 31 décembre 2026.',
    );
  });
});
