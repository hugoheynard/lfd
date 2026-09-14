import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelHostService, FoldPanelRef } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { AccountService, type IdentityDraft } from '../../../../account/account.service';
import { FR } from '../../../copy/fr';
import { matchMediaAt, openedPanel, TOMMEUSES } from '../../account.fixture';
import { IdentityPanel, type IdentityPanelData } from './identity-panel';

/** Une société ouverte avec ses papiers : les trois mentions sont posées. */
const FILLED: IdentityPanelData = {
  companyId: 'cmp_1',
  enseigne: "La Folie Douce Val d'Isère",
  vatNumber: 'FR45812456789',
  raisonSociale: 'SAS Les Tommeuses',
  formeJuridique: 'SAS',
  siret: '81245678900021',
  editable: true,
};

/** Une société ouverte SANS papiers : le commercial était chez le client. */
const BARE: IdentityPanelData = { ...FILLED, raisonSociale: '', formeJuridique: '', siret: '' };

/** Ce que les doublés ont vu passer : les écritures, et les fermetures du panneau. */
interface Wire {
  saves: { companyId: string; draft: IdentityDraft }[];
  answer: string | null;
  closes: unknown[];
}

let wire: Wire;

function boot(data: IdentityPanelData): ComponentFixture<IdentityPanel> {
  wire = { saves: [], answer: null, closes: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [IdentityPanel],
    providers: [
      {
        provide: AccountService,
        useValue: {
          saveIdentity: (companyId: string, draft: IdentityDraft): Promise<string | null> => {
            wire.saves.push({ companyId, draft });
            return Promise.resolve(wire.answer);
          },
        },
      },
      // Le vrai `FoldPanelRef`, branché sur un journal : la fermeture passe par
      // lui, et c'est son résultat que la page reçoit.
      {
        provide: FoldPanelRef,
        useValue: new FoldPanelRef(1, (result) => wire.closes.push(result)),
      },
    ],
  });
  const fixture = TestBed.createComponent(IdentityPanel);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return fixture;
}

describe('IdentityPanel', () => {
  let fixture: ComponentFixture<IdentityPanel>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  /** Le champ dont le libellé visible est `label`. */
  const field = (label: string): HTMLInputElement => {
    const host = Array.from(el().querySelectorAll('fold-input')).find((node) =>
      (node.textContent ?? '').includes(label),
    );
    const input = host?.querySelector('input');
    if (!input) {
      throw new Error(`Pas de champ « ${label} ».`);
    }
    return input;
  };

  const type = (label: string, value: string): void => {
    const input = field(label);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  const button = (text: string): HTMLButtonElement => {
    const found = Array.from(el().querySelectorAll<HTMLButtonElement>('button[foldButton]')).find(
      (b) => (b.textContent ?? '').includes(text),
    );
    if (!found) {
      throw new Error(`Pas de bouton « ${text} ».`);
    }
    return found;
  };

  const save = async (): Promise<void> => {
    button(FR.account.save).click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('préremplit l’enseigne et la TVA de la société', () => {
    fixture = boot(FILLED);

    expect(field(FR.account.identityBrand).value).toBe("La Folie Douce Val d'Isère");
    expect(field(FR.account.identityVatField).value).toBe('FR45812456789');
  });

  it('montre en lecture les mentions déjà renseignées, sans champ, et dit par où passer', () => {
    fixture = boot(FILLED);

    expect(el().querySelectorAll('fold-input').length).toBe(2);
    expect(el().querySelector('.locked')?.textContent).toContain('81245678900021');
    expect(el().textContent).toContain(FR.account.identityLegalLocked);
  });

  it('ouvre en champ les mentions encore vides, et elles seules', () => {
    fixture = boot({ ...BARE, formeJuridique: 'SAS' });

    expect(el().querySelectorAll('fold-input').length).toBe(4);
    expect(() => field(FR.account.identityCompany)).not.toThrow();
    expect(() => field(FR.account.identitySiret)).not.toThrow();
    expect(el().querySelector('.locked')?.textContent).toContain(FR.account.identityForm);
  });

  it('n’arme Enregistrer que lorsque quelque chose a changé', () => {
    fixture = boot(FILLED);
    expect(button(FR.account.save).disabled).toBe(true);

    type(FR.account.identityBrand, 'La Folie Douce');
    expect(button(FR.account.save).disabled).toBe(false);

    type(FR.account.identityBrand, "La Folie Douce Val d'Isère");
    expect(button(FR.account.save).disabled).toBe(true);
  });

  /**
   * Le serveur ignore une mention déjà renseignée ; le panneau ne compte pas
   * dessus. Envoyer sa valeur ferait dépendre la règle de ce qu'il ignore.
   */
  it('n’envoie JAMAIS la valeur d’une mention déjà renseignée', async () => {
    fixture = boot({ ...BARE, raisonSociale: 'SAS Les Tommeuses' });

    type(FR.account.identityVatField, 'FR00123456789');
    type(FR.account.identitySiret, ' 81245678900021 ');
    await save();

    expect(wire.saves).toEqual([
      {
        companyId: 'cmp_1',
        draft: {
          enseigne: "La Folie Douce Val d'Isère",
          vatNumber: 'FR00123456789',
          raisonSociale: '',
          formeJuridique: '',
          siret: '81245678900021',
        },
      },
    ]);
  });

  it('se ferme avec `true` quand l’écriture aboutit', async () => {
    fixture = boot(FILLED);

    type(FR.account.identityBrand, 'La Folie Douce');
    await save();

    expect(wire.closes).toEqual([true]);
  });

  /**
   * Le rappel de `updateIdentity` ne partait qu'au succès : sur un refus, le
   * panneau serait resté figé sur « enregistrement ». Il reste ouvert, se
   * réarme, et montre ce que le serveur a dit.
   */
  it('sur un refus, reste ouvert, se réarme et montre le message du serveur', async () => {
    fixture = boot(BARE);
    wire.answer = 'Le SIRET doit compter 14 chiffres.';

    type(FR.account.identitySiret, '123');
    await save();

    expect(wire.closes).toEqual([]);
    expect(button(FR.account.save).disabled).toBe(false);
    const callout = el().querySelector('fold-callout');
    expect(callout?.textContent).toContain('Le SIRET doit compter 14 chiffres.');
    expect(callout?.textContent).toContain(FR.account.identitySaveFailed);
  });

  /** Aux rôles que l'API refuse, le même panneau en lecture : ni champ, ni Enregistrer. */
  it('en lecture, montre toutes les mentions sans champ ni pied', () => {
    fixture = boot({ ...BARE, editable: false });

    expect(el().querySelectorAll('fold-input').length).toBe(0);
    expect(el().querySelector('fold-panel-footer')).toBeNull();
    const shown = el().querySelector('.locked')?.textContent ?? '';
    expect(shown).toContain("La Folie Douce Val d'Isère");
    expect(shown).toContain('FR45812456789');
    expect(shown).toContain(FR.account.identitySiret);
    expect(shown).toContain(FR.account.identityUnknown);
  });

  it('Annuler ferme sans rien écrire', () => {
    fixture = boot(FILLED);
    type(FR.account.identityBrand, 'Brouillon abandonné');

    button(FR.account.cancel).click();

    expect(wire.saves).toEqual([]);
    expect(wire.closes).toEqual([undefined]);
  });
  describe('open()', () => {
    afterEach(() => {
      TestBed.inject(FoldPanelHostService).dismissAll();
      vi.unstubAllGlobals();
    });

    /** Une saisie : feuille du bas sous le pli, dialogue centré au-delà (règle « Saisir »). */
    it('monte du bas sous le pli, et se centre au-delà', () => {
      boot(FILLED);
      const panels = TestBed.inject(FoldPanelHostService);

      vi.stubGlobal('matchMedia', matchMediaAt(true));
      IdentityPanel.open(panels, TOMMEUSES);
      expect(openedPanel()?.component).toBe(IdentityPanel);
      expect(openedPanel()?.side).toBe('bottom');
      expect(openedPanel()?.data).toEqual({
        companyId: 'cmp_1',
        enseigne: TOMMEUSES.enseigne,
        vatNumber: TOMMEUSES.vatNumber,
        raisonSociale: TOMMEUSES.raisonSociale,
        formeJuridique: TOMMEUSES.formeJuridique,
        siret: TOMMEUSES.siret,
        editable: true,
      });

      panels.dismissAll();
      vi.stubGlobal('matchMedia', matchMediaAt(false));
      IdentityPanel.open(panels, TOMMEUSES);
      expect(openedPanel()?.side).toBe('center');
    });
  });
});
