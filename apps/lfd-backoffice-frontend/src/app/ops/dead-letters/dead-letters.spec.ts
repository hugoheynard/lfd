import { type ComponentFixture, TestBed } from '@angular/core/testing';

import type { DeadLetterView, DeadLettersView, StaffPermission } from '@lfd/contracts';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { OpsService } from '../ops.service';
import { DeadLetters } from './dead-letters';

const LETTER: DeadLetterView = {
  eventId: 'evt-1',
  subscriber: 'orders.mark-ready',
  type: 'order.packed',
  key: 'order.packed:ord-1',
  occurredAt: '2026-10-09T08:00:00.000Z',
  attempts: 8,
  lastError: 'connexion refusée',
};

class FakeOps {
  readonly replayed: { eventId: string; subscriber: string }[] = [];
  reads = 0;
  views: DeadLettersView[] = [];
  failRead = false;

  deadLetters(): Promise<DeadLettersView> {
    this.reads += 1;
    if (this.failRead) return Promise.reject(new Error('down'));
    return Promise.resolve(this.views.shift() ?? { letters: [], truncated: false });
  }

  replay(eventId: string, subscriber: string): Promise<void> {
    this.replayed.push({ eventId, subscriber });
    return Promise.resolve();
  }
}

async function render(
  ops: FakeOps,
  permissions: readonly StaffPermission[],
  successes: string[] = [],
): Promise<ComponentFixture<DeadLetters>> {
  TestBed.configureTestingModule({
    imports: [DeadLetters],
    providers: [
      { provide: OpsService, useValue: ops },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
      {
        provide: NotifyService,
        useValue: { success: (m: string) => successes.push(m), error: () => undefined },
      },
    ],
  });
  const fixture = TestBed.createComponent(DeadLetters);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<DeadLetters>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

const text = (f: ComponentFixture<DeadLetters>): string =>
  (f.nativeElement as HTMLElement).textContent ?? '';

const replayButton = (f: ComponentFixture<DeadLetters>): HTMLButtonElement | undefined =>
  Array.from((f.nativeElement as HTMLElement).querySelectorAll('button')).find((b) =>
    b.textContent?.includes('Rejouer'),
  );

const READ: StaffPermission[] = ['ops_health:read'];
const WRITE: StaffPermission[] = ['ops_health:read', 'ops_health:write'];

describe('DeadLetters', () => {
  it('rend chaque message mort : le fait, l’abonné, les essais, la dernière erreur', async () => {
    const ops = new FakeOps();
    ops.views = [{ letters: [LETTER], truncated: true }];
    const f = await render(ops, WRITE);
    const t = text(f);
    expect(t).toContain('order.packed');
    expect(t).toContain('order.packed:ord-1');
    expect(t).toContain('orders.mark-ready');
    expect(t).toContain('8');
    expect(t).toContain('connexion refusée');
    expect(t).toContain('100 plus récents');
    expect(replayButton(f)).toBeDefined();
  });

  it('ne montre pas « Rejouer » sans ops_health:write', async () => {
    const ops = new FakeOps();
    ops.views = [{ letters: [LETTER], truncated: false }];
    const f = await render(ops, READ);
    expect(text(f)).toContain('order.packed');
    expect(replayButton(f)).toBeUndefined();
  });

  it('rejoue le couple, relit la liste et confirme', async () => {
    const ops = new FakeOps();
    ops.views = [
      { letters: [LETTER], truncated: false },
      { letters: [], truncated: false },
    ];
    const successes: string[] = [];
    const f = await render(ops, WRITE, successes);
    replayButton(f)?.click();
    await settle(f);
    await settle(f);
    expect(ops.replayed).toEqual([{ eventId: 'evt-1', subscriber: 'orders.mark-ready' }]);
    expect(ops.reads).toBe(2);
    expect(successes).toHaveLength(1);
    expect(text(f)).toContain('Aucun message mort');
  });

  it('dit qu’il n’y a aucun message mort', async () => {
    const f = await render(new FakeOps(), READ);
    expect(text(f)).toContain('Aucun message mort');
  });

  it('montre l’erreur de lecture et relit sur « Réessayer »', async () => {
    const ops = new FakeOps();
    ops.failRead = true;
    const f = await render(ops, READ);
    expect(text(f)).toContain('Messages morts illisibles');
    ops.failRead = false;
    const retry = Array.from((f.nativeElement as HTMLElement).querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Réessayer'),
    );
    retry?.click();
    await settle(f);
    await settle(f);
    expect(ops.reads).toBe(2);
    expect(text(f)).toContain('Aucun message mort');
  });
});
