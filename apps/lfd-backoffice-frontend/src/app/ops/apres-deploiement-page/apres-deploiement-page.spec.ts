import { provideRouter } from '@angular/router';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

import type { StaffPermission } from '@lfd/contracts';
import type { PostDeployOverview } from '@lfd/ops-contract';

import { PermissionsStore } from '../../auth/permissions.store';
import { PostDeployService } from '../post-deploy.service';
import { ApresDeploiementPage } from './apres-deploiement-page';

const OVERVIEW: PostDeployOverview = {
  revision: 'abc123',
  anyToDo: true,
  operations: [
    {
      key: 'first',
      title: 'Politiques des mercuriales',
      why: 'w',
      limit: 'l',
      after: [],
      toDo: true,
      blockedBy: [],
      current: null,
      lastRun: null,
    },
    {
      key: 'second',
      title: 'Remises des commandes',
      why: 'w',
      limit: 'l',
      after: ['first'],
      toDo: true,
      blockedBy: ['first'],
      current: null,
      lastRun: null,
    },
  ],
};

async function render(
  overview: () => Promise<PostDeployOverview>,
  permissions: readonly StaffPermission[] = ['ops_post_deploy:read'],
): Promise<ComponentFixture<ApresDeploiementPage>> {
  TestBed.configureTestingModule({
    imports: [ApresDeploiementPage],
    providers: [
      provideRouter([]),
      { provide: PostDeployService, useValue: { overview } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(ApresDeploiementPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (f: ComponentFixture<ApresDeploiementPage>): string =>
  (f.nativeElement as HTMLElement).textContent ?? '';

describe('ApresDeploiementPage', () => {
  it('montre une carte par opération, dans l’ordre, et la révision', async () => {
    const fixture = await render(() => Promise.resolve(OVERVIEW));
    const titles = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('app-post-deploy-operation-card'),
    ).map((card) => card.textContent ?? '');
    expect(titles).toHaveLength(2);
    expect(titles[0]).toContain('Politiques des mercuriales');
    expect(titles[1]).toContain('Bloquée par : Politiques des mercuriales');
    expect(text(fixture)).toContain('abc123');
  });

  it('un échec de lecture se dit, avec « Réessayer »', async () => {
    const fixture = await render(() => Promise.reject(new Error('down')));
    expect(text(fixture)).toContain('Impossible de lire les opérations');
    expect(text(fixture)).toContain('Réessayer');
  });

  it('aucune opération : l’état vide', async () => {
    const fixture = await render(() =>
      Promise.resolve({ revision: 'r', anyToDo: false, operations: [] }),
    );
    expect(text(fixture)).toContain('Aucune opération après déploiement');
  });
});
