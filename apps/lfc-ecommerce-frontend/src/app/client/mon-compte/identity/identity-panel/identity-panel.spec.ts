import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { LegalForm } from '@lfd/contracts';
import { FoldListboxComponent, FoldPanelHostService, FoldPanelRef } from 'fold-ng';
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
  siren: '552100554',
  editable: true,
};

/** Une société ouverte SANS papiers : le commercial était chez le client. */
const BARE: IdentityPanelData = {
  ...FILLED,
  raisonSociale: '',
  formeJuridique: '',
  siret: '',
  siren: '',
};

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

  /**
   * Choisir une forme comme le fait la liste : par sa sortie `selectionChange`,
   * qui rend la clé du catalogue — celle que l'admin écrit aussi.
   */
  const choose = (form: LegalForm): void => {
    const listbox = fixture.debugElement.query(By.directive(FoldListboxComponent));
    (listbox.componentInstance as FoldListboxComponent<LegalForm>).selectionChange.emit(form);
    fixture.detectChanges();
  };

  /** Ce que montre la ligne « Forme juridique » des mentions en lecture. */
  const lockedForm = (): string => {
    const dts = Array.from(el().querySelectorAll('.locked dt'));
    const dt = dts.find((node) => node.textContent?.trim() === FR.account.identityForm);
    return dt?.nextElementSibling?.textContent?.trim() ?? '';
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

    expect(el().querySelectorAll('fold-input').length).toBe(5);
    expect(() => field(FR.account.identityCompany)).not.toThrow();
    expect(() => field(FR.account.identitySiret)).not.toThrow();
    expect(el().querySelector('.locked')?.textContent).toContain(FR.account.identityForm);
  });

  /** La forme décide de la TVA : une LISTE, et seulement quand elle est à compléter. */
  it('la forme juridique est une liste si elle est vide, et n’est plus un champ une fois posée', () => {
    fixture = boot(BARE);
    const listbox = el().querySelector('fold-listbox');
    expect(listbox?.textContent).toContain(FR.account.identityForm);
    expect(() => field(FR.account.identityForm)).toThrow();

    fixture = boot({ ...BARE, formeJuridique: 'sarl' });
    expect(el().querySelector('fold-listbox')).toBeNull();
  });

  it('montre une forme posée par son libellé, et une saisie inconnue telle quelle', () => {
    fixture = boot({ ...FILLED, formeJuridique: 'SAS' });
    expect(lockedForm()).toBe('SAS');

    fixture = boot({ ...FILLED, formeJuridique: 'sarl' });
    expect(lockedForm()).toBe('SARL');

    fixture = boot({ ...FILLED, formeJuridique: 'GIE du Col' });
    expect(lockedForm()).toBe('GIE du Col');
  });

  /**
   * Le marqueur invite, il ne bloque pas : le serveur accepte une identité sans
   * TVA, et un client sans son numéro doit pouvoir poser sa forme.
   */
  it('marque la TVA obligatoire pour une SAS, sans désarmer Enregistrer', () => {
    fixture = boot({ ...BARE, vatNumber: '' });

    choose('sas');
    expect(field(FR.account.identityVatField).required).toBe(true);
    expect(el().textContent).toContain(FR.account.identityVatRequiredHint);
    expect(button(FR.account.save).disabled).toBe(false);
  });

  it('laisse la TVA facultative à une micro-entreprise', () => {
    fixture = boot({ ...BARE, vatNumber: '' });

    choose('micro');
    expect(field(FR.account.identityVatField).required).toBe(false);
    expect(el().textContent).toContain(FR.account.identityVatOptionalHint);
    expect(button(FR.account.save).disabled).toBe(false);
  });

  it('lit la règle de TVA sur la forme déjà enregistrée, ancienne saisie comprise', () => {
    fixture = boot({ ...FILLED, formeJuridique: 'Micro entreprise', vatNumber: '' });
    expect(field(FR.account.identityVatField).required).toBe(false);

    fixture = boot({ ...FILLED, formeJuridique: 'S.A.S.', vatNumber: '' });
    expect(field(FR.account.identityVatField).required).toBe(true);
  });

  it('laisse la TVA facultative tant que la forme est vide ou inconnue, et dit pourquoi', () => {
    fixture = boot({ ...BARE, vatNumber: '' });
    expect(field(FR.account.identityVatField).required).toBe(false);
    expect(el().textContent).toContain(FR.account.identityVatUndecidedHint);

    fixture = boot({ ...FILLED, formeJuridique: 'GIE du Col', vatNumber: '' });
    expect(field(FR.account.identityVatField).required).toBe(false);
    expect(el().textContent).toContain(FR.account.identityVatUndecidedHint);
  });

  /**
   * L'admin écrit la clé que rend `selectionChange` (`company-identity-fields`
   * → `identite-panel`, `formeJuridique.trim()`) : le client envoie la même.
   */
  it('envoie la clé du catalogue, comme l’admin', async () => {
    fixture = boot(BARE);

    choose('auto_entrepreneur');
    await save();

    expect(wire.saves[0]?.draft.formeJuridique).toBe('auto_entrepreneur');
  });

  /** Décision de Hugo (2026-09-15) : le client complète son SIREN, il ne le corrige pas. */
  it('le SIREN n’est un champ que s’il est vide ; renseigné, il se lit', () => {
    fixture = boot({ ...FILLED, siren: '' });
    expect(() => field(FR.account.identitySiren)).not.toThrow();

    fixture = boot(FILLED);
    expect(() => field(FR.account.identitySiren)).toThrow();
    expect(el().querySelector('.locked')?.textContent).toContain('552100554');
  });

  it('propose le SIREN que porte le SIRET saisi, s’il forme un SIREN valide', () => {
    fixture = boot(BARE);

    type(FR.account.identitySiret, '73282932000009');
    expect(field(FR.account.identitySiren).value).toBe('732829320');

    // Un préfixe qui n'est pas un SIREN valide ne propose rien, et retire la proposition.
    type(FR.account.identitySiret, '81245678900021');
    expect(field(FR.account.identitySiren).value).toBe('');
  });

  it('ne réécrit jamais un SIREN tapé par le client', () => {
    fixture = boot(BARE);

    type(FR.account.identitySiren, '552100554');
    type(FR.account.identitySiret, '73282932000009');
    expect(field(FR.account.identitySiren).value).toBe('552100554');
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
          siren: '',
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
        siren: TOMMEUSES.siren,
        editable: true,
      });

      panels.dismissAll();
      vi.stubGlobal('matchMedia', matchMediaAt(false));
      IdentityPanel.open(panels, TOMMEUSES);
      expect(openedPanel()?.side).toBe('center');
    });
  });
});
