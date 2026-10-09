import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelHostService, FoldPanelRef } from 'fold-ng';

import { FR } from '../../copy/fr';
import { NOTIFICATIONS_DEMO } from '../notifications.fixture';
import { NotificationsSheet } from '../notifications-sheet/notifications-sheet';
import { NotificationsMenu } from './notifications-menu';

/** Un hôte de panneaux qui compte ses ouvertures et rend de vraies références. */
class PanelsDouble {
  readonly opened: unknown[] = [];
  open(component: unknown): FoldPanelRef<void> {
    this.opened.push(component);
    const ref: FoldPanelRef<void> = new FoldPanelRef<void>(this.opened.length, (result) => {
      void result;
    });
    return ref;
  }
}

function boot(): { fixture: ComponentFixture<NotificationsMenu>; panels: PanelsDouble } {
  const panels = new PanelsDouble();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [NotificationsMenu],
    providers: [{ provide: FoldPanelHostService, useValue: panels }],
  });
  const fixture = TestBed.createComponent(NotificationsMenu);
  fixture.detectChanges();
  return { fixture, panels };
}

const host = (fixture: ComponentFixture<NotificationsMenu>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const deskBell = (fixture: ComponentFixture<NotificationsMenu>): HTMLButtonElement | null =>
  host(fixture).querySelector<HTMLButtonElement>('.at-desk button.bell');

const pocketBell = (fixture: ComponentFixture<NotificationsMenu>): HTMLButtonElement | null =>
  host(fixture).querySelector<HTMLButtonElement>('button.bell.in-pocket');

const UNREAD = NOTIFICATIONS_DEMO.filter((notification) => !notification.read).length;

describe('NotificationsMenu — la cloche', () => {
  it('porte le compte des non-lues dans son nom ET dans sa pastille', () => {
    const { fixture } = boot();

    expect(deskBell(fixture)?.getAttribute('aria-label')).toBe(
      `${FR.chrome.notifications} — ${UNREAD}`,
    );
    expect(host(fixture).querySelector('.badge')?.textContent?.trim()).toBe(String(UNREAD));
  });

  it('ouvre et referme le popover au bureau', () => {
    const { fixture } = boot();
    expect(deskBell(fixture)?.getAttribute('aria-expanded')).toBe('false');

    deskBell(fixture)?.click();
    fixture.detectChanges();
    expect(deskBell(fixture)?.getAttribute('aria-expanded')).toBe('true');

    host(fixture).querySelector<HTMLButtonElement>('.foot-action')?.click();
    fixture.detectChanges();
    expect(deskBell(fixture)?.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('NotificationsMenu — la feuille du bas', () => {
  it('un clic ouvre la feuille, un second la referme sans en empiler une autre', async () => {
    const { fixture, panels } = boot();

    pocketBell(fixture)?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(panels.opened).toEqual([NotificationsSheet]);
    expect(pocketBell(fixture)?.getAttribute('aria-expanded')).toBe('true');

    pocketBell(fixture)?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(panels.opened.length).toBe(1);
    expect(pocketBell(fixture)?.getAttribute('aria-expanded')).toBe('false');

    // Oubliée à la fermeture : le clic suivant rouvre.
    pocketBell(fixture)?.click();
    await fixture.whenStable();
    expect(panels.opened.length).toBe(2);
  });
});
