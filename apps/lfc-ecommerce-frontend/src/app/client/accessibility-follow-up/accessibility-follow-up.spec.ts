import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { AccessibilityFollowUpView } from '@lfd/contracts';

import { AUTH_CONFIG } from '../../auth/auth.config';
import {
  ACCESSIBILITY_FOLLOW_UP_EN,
  ACCESSIBILITY_FOLLOW_UP_FR,
} from '../copy/screens/accessibility-follow-up.copy';
import { AccessibilityFollowUp, auditLine, followUpRows } from './accessibility-follow-up';

const URL = `${AUTH_CONFIG.apiBaseUrl}/content/accessibility-follow-up`;

/** Les dates ne sont comparées qu'à leur propre mise en forme, jamais à l'horloge. */
const VIEW: AccessibilityFollowUpView = {
  corrections: [
    {
      theme: 1,
      date: '2026-10-26',
      status: 'done',
      label: { fr: 'Alternatives des images', en: 'Image alternatives', it: 'Alternative' },
    },
    {
      theme: null,
      date: null,
      status: 'planned',
      label: { fr: 'Audit complet', en: 'Full audit', it: 'Audit completo' },
    },
  ],
  audit: { plannedFor: null, completedOn: null },
  conformity: null,
};

describe('followUpRows', () => {
  it('nomme la thématique par son numéro et son libellé RGAA, dans la langue', () => {
    const [first, second] = followUpRows(VIEW.corrections, ACCESSIBILITY_FOLLOW_UP_EN, 'en');
    expect(first?.theme).toBe('1. Images');
    expect(first?.correction).toBe('Image alternatives');
    expect(first?.statusLabel).toBe('Done');
    expect(second?.theme).toBe('Whole site');
    expect(second?.date).toBe('To be dated');
  });

  it('met le jour en forme sans le décaler', () => {
    const [first] = followUpRows(VIEW.corrections, ACCESSIBILITY_FOLLOW_UP_FR, 'fr');
    expect(first?.date).toBe('26 octobre 2026');
  });
});

describe('auditLine', () => {
  it('dit « non encore planifié » tant qu’aucun mois n’est prévu', () => {
    expect(auditLine(VIEW.audit, ACCESSIBILITY_FOLLOW_UP_FR, 'fr')).toBe(
      ACCESSIBILITY_FOLLOW_UP_FR.auditNotPlanned,
    );
  });

  it('nomme le mois prévu', () => {
    const line = auditLine(
      { plannedFor: '2026-12', completedOn: null },
      ACCESSIBILITY_FOLLOW_UP_FR,
      'fr',
    );
    expect(line).toBe('Audit complet prévu en décembre 2026.');
  });
});

describe('le suivi des corrections d’accessibilité', () => {
  let fixture: ComponentFixture<AccessibilityFollowUp>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AccessibilityFollowUp],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AccessibilityFollowUp);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('montre un tableau nommé, à en-têtes de colonne, et un statut écrit en mots', () => {
    http.expectOne(URL).flush(VIEW);
    fixture.detectChanges();

    expect(el().querySelector('table caption')?.textContent).toContain(
      ACCESSIBILITY_FOLLOW_UP_FR.caption,
    );
    expect(el().querySelectorAll('th[scope="col"]').length).toBe(4);
    const badges = Array.from(el().querySelectorAll('fold-badge')).map((b) => b.textContent);
    expect(badges.length).toBe(2);
    expect(badges[0]).toContain(ACCESSIBILITY_FOLLOW_UP_FR.correctionDone);
    expect(el().querySelector('[data-audit]')?.textContent).toContain(
      ACCESSIBILITY_FOLLOW_UP_FR.auditNotPlanned,
    );
  });

  it('ne montre aucun taux', () => {
    http.expectOne(URL).flush(VIEW);
    fixture.detectChanges();

    expect(el().textContent).not.toContain('%');
  });

  it('dit un échec de lecture dans un callout discret, sans rien bloquer', () => {
    http.expectOne(URL).flush('nope', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(el().querySelector('fold-callout')?.textContent).toContain(
      ACCESSIBILITY_FOLLOW_UP_FR.loadFailed,
    );
    expect(el().querySelector('fold-data-table')).toBeNull();
  });
});
