import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { MyDriverNoticeView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { DriverNoticeService } from '../driver-notice.service';
import { myNoticeOf } from '../driver-notice.fixture';
import { DriverNoticePage } from './driver-notice-page';

async function boot(answer: MyDriverNoticeView | null): Promise<HTMLElement> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: DriverNoticeService,
        useValue: {
          mine: (): Promise<MyDriverNoticeView> =>
            answer === null ? Promise.reject(new Error('hors ligne')) : Promise.resolve(answer),
        } satisfies Pick<DriverNoticeService, 'mine'>,
      },
    ],
  });
  const fixture: ComponentFixture<DriverNoticePage> = TestBed.createComponent(DriverNoticePage);
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('DriverNoticePage — « Mes données »', () => {
  it('relit le texte, et dit quand il a été lu', async () => {
    const element = await boot(myNoticeOf(1, '2026-10-01T05:42:00.000Z'));

    expect(element.querySelectorAll('[data-notice-section]')).toHaveLength(2);
    expect(element.querySelector('[data-read-on]')?.textContent).toContain('à 7 h 42');
  });

  it('pas encore lu : annonce qu’il sera présenté au départ', async () => {
    const element = await boot(myNoticeOf(1, null));

    expect(element.querySelector('[data-not-read]')).not.toBeNull();
  });

  it('illisible : l’état d’erreur de fold', async () => {
    const element = await boot(null);

    expect(element.querySelector('[data-notice-error]')).not.toBeNull();
  });
});
