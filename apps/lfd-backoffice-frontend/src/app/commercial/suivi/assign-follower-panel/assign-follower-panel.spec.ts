import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { SalesOversightService } from '../sales-oversight.service';
import { AssignFollowerPanel, type AssignFollowerPanelData } from './assign-follower-panel';

class FakeApi {
  readonly calls: { companyId: string; followerStaffId: string | null; key: string }[] = [];
  failures = 0;
  assignFollower(companyId: string, followerStaffId: string | null, key: string): Promise<void> {
    this.calls.push({ companyId, followerStaffId, key });
    if (this.failures > 0) {
      this.failures -= 1;
      return Promise.reject(
        new HttpErrorResponse({
          status: 409,
          error: { message: 'Cette personne a un accès suspendu.' },
        }),
      );
    }
    return Promise.resolve();
  }
}

class FakeNotify {
  readonly successes: string[] = [];
  success(message: string): void {
    this.successes.push(message);
  }
}

const DATA: AssignFollowerPanelData = {
  companyId: 'co_1',
  companyName: 'Café Y',
  currentFollowerId: 'st_a',
  assignable: [
    { id: 'st_a', name: 'Anne' },
    { id: 'st_b', name: 'Béa' },
  ],
};

interface Rendered {
  readonly fixture: ComponentFixture<AssignFollowerPanel>;
  readonly api: FakeApi;
  readonly notify: FakeNotify;
  readonly closed: (boolean | undefined)[];
}

function render(data: AssignFollowerPanelData = DATA): Rendered {
  const api = new FakeApi();
  const notify = new FakeNotify();
  const closed: (boolean | undefined)[] = [];
  TestBed.configureTestingModule({
    imports: [AssignFollowerPanel],
    providers: [
      { provide: SalesOversightService, useValue: api },
      { provide: NotifyService, useValue: notify },
      {
        provide: FoldPanelRef,
        useValue: new FoldPanelRef<boolean>(1, (result) => closed.push(result)),
      },
    ],
  });
  const fixture = TestBed.createComponent(AssignFollowerPanel);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return { fixture, api, notify, closed };
}

const element = (fixture: ComponentFixture<AssignFollowerPanel>, selector: string) =>
  (fixture.nativeElement as HTMLElement).querySelector(selector);

describe('AssignFollowerPanel — confier le suivi', () => {
  it('attend un choix, puis confie la fiche sous une clé d’intention', async () => {
    const { fixture, api, notify, closed } = render();
    const panel = fixture.componentInstance;
    await panel.assign();
    expect(api.calls).toEqual([]);

    panel.chosen.set('st_b');
    await panel.assign();

    expect(api.calls).toEqual([
      { companyId: 'co_1', followerStaffId: 'st_b', key: expect.any(String) },
    ]);
    expect(api.calls[0]?.key).not.toBe('');
    expect(notify.successes).toEqual(['Café Y est confiée à Béa.']);
    expect(closed).toEqual([true]);
  });

  it('retire le suiveur', async () => {
    const { fixture, api, closed } = render();
    await fixture.componentInstance.remove();
    expect(api.calls[0]?.followerStaffId).toBeNull();
    expect(closed).toEqual([true]);
  });

  it('ne propose pas « Retirer » à une fiche sans suiveur', () => {
    const { fixture } = render({ ...DATA, currentFollowerId: null });
    expect(element(fixture, '[data-remove]')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Attribuer la fiche');
  });

  it('un refus reste dans le dialogue, et le réessai du même choix repasse la même clé', async () => {
    const { fixture, api, closed } = render();
    api.failures = 1;
    const panel = fixture.componentInstance;
    panel.chosen.set('st_b');
    await panel.assign();
    expect(panel.refusal()).toContain('accès suspendu');
    expect(closed).toEqual([]);

    await panel.assign();
    expect(api.calls[1]?.key).toBe(api.calls[0]?.key);
    expect(closed).toEqual([true]);
  });
});
