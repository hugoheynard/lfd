import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { ClientLocale } from '../../client-locale.service';
import { EN } from '../../copy/en';
import { NOTIFICATIONS_DEMO } from '../notifications.fixture';
import { NotificationsFeedView } from './notifications-feed-view';

function boot(withHead = true): ComponentFixture<NotificationsFeedView> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [NotificationsFeedView] });
  const fixture = TestBed.createComponent(NotificationsFeedView);
  fixture.componentRef.setInput('withHead', withHead);
  fixture.detectChanges();
  return fixture;
}

const host = (fixture: ComponentFixture<NotificationsFeedView>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const notes = (fixture: ComponentFixture<NotificationsFeedView>): HTMLElement[] =>
  Array.from(host(fixture).querySelectorAll<HTMLElement>('.note'));

/** Le nombre de non-lues de la maquette — lu sur elle, jamais recopié. */
const UNREAD = NOTIFICATIONS_DEMO.filter((notification) => !notification.read).length;

describe('NotificationsFeedView — le fil', () => {
  it('dit les non-lues et le total', () => {
    expect(host(boot()).querySelector('.head-note')?.textContent?.trim()).toBe(
      `${UNREAD} non lues · ${NOTIFICATIONS_DEMO.length} au total`,
    );
  });

  it("n'a pas de bande de tête dans la feuille du bas", () => {
    expect(host(boot(false)).querySelector('.head')).toBeNull();
  });

  it('« Fermer » le demande à son hôte', () => {
    const fixture = boot();
    let asked = 0;
    fixture.componentInstance.closeRequested.subscribe(() => asked++);

    host(fixture).querySelector<HTMLButtonElement>('.foot-action')?.click();

    expect(asked).toBe(1);
  });

  /** SPEC §7 : la non-lue est portée par le liséré autant que par la graisse. */
  it('marque chaque non-lue, et elle seule', () => {
    const marked = notes(boot()).map((note) => note.classList.contains('is-unread'));

    expect(marked).toEqual(NOTIFICATIONS_DEMO.map((notification) => !notification.read));
  });

  it('« Tout marquer comme lu » éteint les non-lues, puis disparaît', () => {
    const fixture = boot();
    host(fixture).querySelector<HTMLButtonElement>('.mark-all')?.click();
    fixture.detectChanges();

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
