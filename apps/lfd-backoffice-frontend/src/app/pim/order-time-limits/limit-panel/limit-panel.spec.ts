import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { OrderTimeLimitPayload, OrderTimeLimitView } from '@lfd/pim-contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { OrderTimeLimitsService } from '../order-time-limits.service';
import { LimitPanel, type LimitPanelData } from './limit-panel';

/** La case « l'équipe peut passer outre » : décochée d'office, relue, envoyée. */

const RULE: OrderTimeLimitView = {
  id: 'l1',
  scope: { type: 'product', id: 'p1' },
  scopeLabel: 'Bûche',
  daysBefore: 2,
  time: '12:00',
  graceMinutes: null,
  staffMayExceed: true,
  archived: false,
};

class FakeApi {
  readonly sent: OrderTimeLimitPayload[] = [];
  set(payload: OrderTimeLimitPayload): Promise<{ id: string }> {
    this.sent.push(payload);
    return Promise.resolve({ id: 'l1' });
  }
}

const notify = { success: (): void => undefined, error: (): void => undefined };

async function render(
  data: LimitPanelData,
  api = new FakeApi(),
): Promise<{ fixture: ComponentFixture<LimitPanel>; api: FakeApi }> {
  TestBed.configureTestingModule({
    imports: [LimitPanel],
    providers: [
      { provide: OrderTimeLimitsService, useValue: api },
      { provide: NotifyService, useValue: notify },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, () => undefined) },
    ],
  });
  const fixture = TestBed.createComponent(LimitPanel);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, api };
}

const box = (fixture: ComponentFixture<LimitPanel>): HTMLInputElement =>
  (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
    'fold-checkbox input[type="checkbox"]',
  ) as HTMLInputElement;

const submit = async (fixture: ComponentFixture<LimitPanel>): Promise<void> => {
  const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll('button');
  (buttons[buttons.length - 1] as HTMLButtonElement).click();
  await fixture.whenStable();
};

describe('LimitPanel — la case « l’équipe peut passer outre »', () => {
  it('est décochée sur une limite neuve, et part à false', async () => {
    const { fixture, api } = await render({ productId: 'p1', label: 'Bûche', rule: null });
    expect(box(fixture).checked).toBe(false);
    const time = (fixture.nativeElement as HTMLElement).querySelector(
      'input[type="time"]',
    ) as HTMLInputElement;
    time.value = '10:00';
    time.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await submit(fixture);
    expect(api.sent).toEqual([
      {
        scope: { type: 'product', id: 'p1' },
        daysBefore: 1,
        time: '10:00',
        graceMinutes: null,
        staffMayExceed: false,
      },
    ]);
  });

  it('relit la case depuis la limite, et envoie ce qui est coché', async () => {
    const { fixture, api } = await render({ productId: 'p1', label: 'Bûche', rule: RULE });
    expect(box(fixture).checked).toBe(true);
    box(fixture).click();
    fixture.detectChanges();
    await submit(fixture);
    expect(api.sent[0]?.staffMayExceed).toBe(false);
  });

  it('dit sous la case ce qu’elle permet', async () => {
    const { fixture } = await render({ productId: 'p1', label: 'Bûche', rule: null });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "L'heure limite générale reste opposée.",
    );
  });
});
