import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { ClientLocale } from '../../client-locale.service';
import { EN } from '../../copy/en';
import { FR } from '../../copy/fr';
import { NotificationsMenu } from './notifications-menu';
import { NOTIFICATIONS_DEMO } from './notifications.fixture';

function boot(): ComponentFixture<NotificationsMenu> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [NotificationsMenu] });
  const fixture = TestBed.createComponent(NotificationsMenu);
  fixture.detectChanges();
  return fixture;
}

const host = (fixture: ComponentFixture<NotificationsMenu>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const bell = (fixture: ComponentFixture<NotificationsMenu>): HTMLButtonElement | null =>
  host(fixture).querySelector<HTMLButtonElement>('button.bell');

const notes = (fixture: ComponentFixture<NotificationsMenu>): HTMLElement[] =>
  Array.from(host(fixture).querySelectorAll<HTMLElement>('.note'));

/** Le nombre de non-lues de la maquette — lu sur elle, jamais recopié. */
const UNREAD = NOTIFICATIONS_DEMO.filter((notification) => !notification.read).length;

describe('NotificationsMenu — la cloche', () => {
  it('porte le compte des non-lues dans son nom ET dans sa pastille', () => {
    const fixture = boot();

    expect(bell(fixture)?.getAttribute('aria-label')).toBe(
      `${FR.chrome.notifications} — ${UNREAD}`,
    );
    expect(host(fixture).querySelector('.badge')?.textContent?.trim()).toBe(String(UNREAD));
  });

  it('ouvre et referme le panneau', () => {
    const fixture = boot();
    expect(bell(fixture)?.getAttribute('aria-expanded')).toBe('false');

    bell(fixture)?.click();
    fixture.detectChanges();
    expect(bell(fixture)?.getAttribute('aria-expanded')).toBe('true');

    host(fixture).querySelector<HTMLButtonElement>('.foot-action')?.click();
    fixture.detectChanges();
    expect(bell(fixture)?.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('NotificationsMenu — le fil', () => {
  it('dit les non-lues et le total', () => {
    expect(host(boot()).querySelector('.head-note')?.textContent?.trim()).toBe(
      `${UNREAD} non lues · ${NOTIFICATIONS_DEMO.length} au total`,
    );
  });

  /**
   * SPEC §7 : la non-lue est portée par le liséré autant que par la graisse —
   * jamais par la couleur seule. La classe porte les deux.
   */
  it('marque chaque non-lue, et elle seule', () => {
    const marked = notes(boot()).map((note) => note.classList.contains('is-unread'));

    expect(marked).toEqual(NOTIFICATIONS_DEMO.map((notification) => !notification.read));
  });

  it('« Tout marquer comme lu » éteint la pastille, puis disparaît', () => {
    const fixture = boot();
    expect(host(fixture).querySelector('.mark-all')).not.toBeNull();

    host(fixture).querySelector<HTMLButtonElement>('.mark-all')?.click();
    fixture.detectChanges();

    expect(host(fixture).querySelector('.badge')).toBeNull();
    expect(host(fixture).querySelector('.mark-all')).toBeNull();
    expect(notes(fixture).some((note) => note.classList.contains('is-unread'))).toBe(false);
  });

  it('parle la langue choisie', () => {
    const fixture = boot();
    TestBed.inject(ClientLocale).current.set('en');
    fixture.detectChanges();

    expect(host(fixture).querySelector('.head-title')?.textContent?.trim()).toBe(
      EN.chrome.notifications,
    );
    expect(notes(fixture)[0]?.querySelector('.note-subject')?.textContent?.trim()).toBe(
      NOTIFICATIONS_DEMO[0]?.text.en.subject,
    );
  });
});
