import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { CorrectBudgetCommitmentPayload } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../notify.service';
import { AdminOrdersService } from '../orders.service';
import {
  BudgetCommitmentDialog,
  type BudgetCommitmentDialogData,
} from './budget-commitment-dialog';

const DATA: BudgetCommitmentDialogData = {
  orderId: 'ord_1',
  orderNumber: 'CMD-7',
  current: { number: '1300012345', serviceCode: 'SRV-01' },
  requirements: {
    payerCompanyId: 'cmp_army',
    publicPayer: true,
    commitmentRequired: false,
    serviceCodeRequired: false,
    defaultServiceCode: 'SRV-01',
    timing: 'at_order',
    currentCommitment: null,
  },
};

const ALREADY_INVOICED =
  'Cette commande est déjà facturée : son numéro d’engagement ne change plus. Faites un avoir.';

async function render(
  correct: (payload: CorrectBudgetCommitmentPayload) => Promise<void>,
): Promise<{
  fixture: ComponentFixture<BudgetCommitmentDialog>;
  sent: CorrectBudgetCommitmentPayload[];
  closed: Promise<boolean | undefined>;
}> {
  const sent: CorrectBudgetCommitmentPayload[] = [];
  const ref = new FoldPanelRef<boolean>(1, () => undefined);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BudgetCommitmentDialog],
    providers: [
      {
        provide: AdminOrdersService,
        useValue: {
          correctBudgetCommitment: (_orderId: string, payload: CorrectBudgetCommitmentPayload) => {
            sent.push(payload);
            return correct(payload);
          },
        } satisfies Pick<AdminOrdersService, 'correctBudgetCommitment'>,
      },
      { provide: NotifyService, useValue: { success: () => undefined } },
      { provide: FoldPanelRef, useValue: ref },
    ],
  });
  const fixture = TestBed.createComponent(BudgetCommitmentDialog);
  fixture.componentRef.setInput('data', DATA);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, sent, closed: ref.closed };
}

function type(fixture: ComponentFixture<BudgetCommitmentDialog>, selector: string, value: string) {
  const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
    `${selector} input`,
  );
  if (input === null) {
    throw new Error(`champ ${selector} introuvable`);
  }
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

async function save(fixture: ComponentFixture<BudgetCommitmentDialog>): Promise<void> {
  (fixture.nativeElement as HTMLElement)
    .querySelector<HTMLButtonElement>('[data-budget-commitment-save]')
    ?.click();
  for (let pass = 0; pass < 3; pass += 1) {
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

const saveButton = (fixture: ComponentFixture<BudgetCommitmentDialog>): HTMLButtonElement | null =>
  (fixture.nativeElement as HTMLElement).querySelector('[data-budget-commitment-save]');

describe('BudgetCommitmentDialog', () => {
  it('rien de changé : Enregistrer n’est pas cliquable', async () => {
    const { fixture } = await render(() => Promise.resolve());

    expect(saveButton(fixture)?.disabled).toBe(true);
  });

  it('envoie le numéro corrigé, et se ferme sur un succès', async () => {
    const { fixture, sent, closed } = await render(() => Promise.resolve());

    type(fixture, '[data-budget-commitment-number]', ' 1300067890 ');
    await save(fixture);

    expect(sent).toEqual([{ budgetCommitment: { number: '1300067890', serviceCode: 'SRV-01' } }]);
    await expect(closed).resolves.toBe(true);
  });

  it('deux champs vides retirent l’engagement (null)', async () => {
    const { fixture, sent } = await render(() => Promise.resolve());

    type(fixture, '[data-budget-commitment-number]', '');
    type(fixture, '[data-budget-commitment-service]', '');
    await save(fixture);

    expect(sent).toEqual([{ budgetCommitment: null }]);
  });

  it('une commande déjà facturée : le message du serveur, tel quel, dans le dialogue', async () => {
    const { fixture } = await render(() =>
      Promise.reject(
        new HttpErrorResponse({
          status: 409,
          error: { code: 'budget_commitment.already_invoiced', message: ALREADY_INVOICED },
        }),
      ),
    );

    type(fixture, '[data-budget-commitment-number]', 'N-2');
    await save(fixture);

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-budget-commitment-refusal]')
        ?.textContent,
    ).toContain(ALREADY_INVOICED);
  });
});
