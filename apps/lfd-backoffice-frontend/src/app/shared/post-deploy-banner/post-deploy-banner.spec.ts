import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

import type { StaffPermission } from '@lfd/contracts';
import type { PostDeployOverview } from '@lfd/ops-contract';

import { PermissionsStore } from '../../auth/permissions.store';
import { PostDeployService } from '../../ops/post-deploy.service';
import { PostDeployBanner } from './post-deploy-banner';

const overview = (anyToDo: boolean): PostDeployOverview => ({
  revision: 'r',
  anyToDo,
  operations: [],
});

async function render(
  anyToDo: boolean,
  permissions: readonly StaffPermission[],
): Promise<{ fixture: ComponentFixture<PostDeployBanner>; reads: () => number }> {
  let reads = 0;
  const granted = signal(permissions);
  TestBed.configureTestingModule({
    imports: [PostDeployBanner],
    providers: [
      provideRouter([]),
      {
        provide: PostDeployService,
        useValue: {
          overview: (): Promise<PostDeployOverview> => {
            reads += 1;
            return Promise.resolve(overview(anyToDo));
          },
        },
      },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => granted().includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(PostDeployBanner);
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, reads: () => reads };
}

const link = (f: ComponentFixture<PostDeployBanner>): HTMLAnchorElement | null =>
  (f.nativeElement as HTMLElement).querySelector('a');

describe('PostDeployBanner', () => {
  it('à faire et droit de lecture : le bandeau mène à la page', async () => {
    const { fixture, reads } = await render(true, ['ops_post_deploy:read']);
    expect(link(fixture)?.getAttribute('href')).toBe('/sante/apres-deploiement');
    expect(reads()).toBe(1);
  });

  it('rien à faire : pas de bandeau', async () => {
    const { fixture } = await render(false, ['ops_post_deploy:read']);
    expect(link(fixture)).toBeNull();
  });

  it('sans le droit : ni bandeau, ni lecture', async () => {
    const { fixture, reads } = await render(true, ['ops_health:read']);
    expect(link(fixture)).toBeNull();
    expect(reads()).toBe(0);
  });

  it('ne relit pas à chaque rendu', async () => {
    const { fixture, reads } = await render(true, ['ops_post_deploy:read']);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(reads()).toBe(1);
  });
});
