import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  DEFAULT_ORDER_CUTOFF_SETTINGS,
  type OrderCutoffSettingsPatch,
  type OrderCutoffSettingsView,
  type StaffPermission,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { OrderCutoffSettingsService } from '../order-cutoff-settings.service';
import { SameDayCircuitCard } from './same-day-circuit-card';

/**
 * **Le circuit du jour J** (lot L3, `plan-jour-meme-sur-stock.md` §14) : la
 * carte lit, n'envoie que ce qui a changé, et dit qu'elle n'a pas encore
 * d'effet.
 */

class FakeSettings {
  readonly patches: OrderCutoffSettingsPatch[] = [];
  refusal: unknown = null;

  constructor(private current: OrderCutoffSettingsView | Error) {}

  read(): Promise<OrderCutoffSettingsView> {
    return this.current instanceof Error
      ? Promise.reject(this.current)
      : Promise.resolve(this.current);
  }

  update(patch: OrderCutoffSettingsPatch): Promise<void> {
    this.patches.push(patch);
    if (this.refusal !== null) {
      return Promise.reject(this.refusal);
    }
    const before = this.current instanceof Error ? DEFAULT_ORDER_CUTOFF_SETTINGS : this.current;
    this.current = { ...before, ...definedOf(patch), updatedBy: 'Hugo' };
    return Promise.resolve();
  }
}

/** La rustine sans ses clés absentes, comme le serveur la lit. */
function definedOf(patch: OrderCutoffSettingsPatch): Partial<OrderCutoffSettingsView> {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
}

async function mount(
  api: FakeSettings,
  permissions: readonly StaffPermission[] = ['lfc_order_settings:read', 'lfc_order_settings:write'],
): Promise<ComponentFixture<SameDayCircuitCard>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [SameDayCircuitCard],
    providers: [
      { provide: OrderCutoffSettingsService, useValue: api },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(SameDayCircuitCard);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const element = (fixture: ComponentFixture<SameDayCircuitCard>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('SameDayCircuitCard', () => {
  it('lit les réglages, tous fermés par défaut, et dit qu’ils ne prennent pas encore effet', async () => {
    const fixture = await mount(new FakeSettings(DEFAULT_ORDER_CUTOFF_SETTINGS));

    const text = element(fixture).textContent ?? '';
    expect(text).toContain('Particuliers : commander pour aujourd’hui');
    expect(text).toContain('Pros en ligne (hors comptoir)');
    expect(text).toContain('ne prennent pas encore effet');
    expect(fixture.componentInstance['draft']()).toEqual({
      sameDayPublicAllowed: false,
      sameDayProAllowed: false,
      sameDayProOnline: false,
      sameDayProWithoutCredit: 'refuse',
      shelfHoldMinutes: 30,
    });
    expect(fixture.componentInstance['patch']()).toBeNull();
  });

  it('n’envoie que ce qui a changé, puis relit', async () => {
    const api = new FakeSettings(DEFAULT_ORDER_CUTOFF_SETTINGS);
    const fixture = await mount(api);
    const card = fixture.componentInstance;

    card['set']('sameDayProAllowed', true);
    card['set']('sameDayProWithoutCredit', 'payment_link');
    card['set']('shelfHoldMinutes', 15);
    await card['save']();

    expect(api.patches).toEqual([
      { sameDayProAllowed: true, sameDayProWithoutCredit: 'payment_link', shelfHoldMinutes: 15 },
    ]);
    expect(card['settings']()?.shelfHoldMinutes).toBe(15);
    expect(card['patch']()).toBeNull();
  });

  it('une durée vidée ne s’enregistre pas', async () => {
    const fixture = await mount(new FakeSettings(DEFAULT_ORDER_CUTOFF_SETTINGS));
    const card = fixture.componentInstance;

    card['set']('sameDayPublicAllowed', true);
    card['set']('shelfHoldMinutes', null);

    expect(card['canSave']()).toBe(false);
  });

  it('dit un refus du serveur et garde le brouillon', async () => {
    const api = new FakeSettings(DEFAULT_ORDER_CUTOFF_SETTINGS);
    api.refusal = new Error('refusé');
    const fixture = await mount(api);
    const card = fixture.componentInstance;

    card['set']('shelfHoldMinutes', 15);
    await card['save']();
    fixture.detectChanges();

    expect(element(fixture).querySelector('fold-callout[variant="alert"]')).not.toBeNull();
    expect(card['draft']()?.shelfHoldMinutes).toBe(15);
  });

  it('sans `lfc_order_settings:write`, montre les réglages sans bouton d’enregistrement', async () => {
    const fixture = await mount(new FakeSettings(DEFAULT_ORDER_CUTOFF_SETTINGS), [
      'lfc_order_settings:read',
    ]);

    expect(element(fixture).querySelector('[data-same-day-circuit-save]')).toBeNull();
  });

  it('propose de réessayer quand la lecture échoue', async () => {
    const fixture = await mount(new FakeSettings(new Error('panne')));

    expect(element(fixture).textContent).toContain('Impossible de charger les réglages du jour J');
  });
});
