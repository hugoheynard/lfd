import { TestBed } from '@angular/core/testing';
import type { AccountingRulesView } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { AccountingRulesPage } from '../accounting-rules-page/accounting-rules-page';
import { AccountingRulesHttpApi } from '../accounting-rules-http-api';

/** Le droit comptable, accordé ou non — le seul que cet écran regarde. */
function permissions(granted: boolean): Pick<PermissionsStore, 'can'> {
  return { can: () => granted };
}

/**
 * On double l'**API**, pas le store : le store lit au démarrage, dans son
 * constructeur. Le doubler après l'injection laisserait cette première lecture
 * partir pour de vrai — c'est ce qui faisait passer un test « rapport en place »
 * pour un échec réseau.
 */
function stubApi(read: () => Promise<AccountingRulesView>): Pick<AccountingRulesHttpApi, 'read'> {
  return { read };
}

interface Setup {
  readonly granted?: boolean;
  readonly view?: AccountingRulesView;
  readonly fails?: boolean;
}

async function render({ granted = true, view, fails = false }: Setup = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: PermissionsStore, useValue: permissions(granted) },
      {
        provide: AccountingRulesHttpApi,
        useValue: stubApi(() =>
          fails
            ? Promise.reject(new Error('réseau'))
            : Promise.resolve(view ?? { ratioBp: null, updatedAt: null }),
        ),
      },
    ],
  });

  const fixture = TestBed.createComponent(AccountingRulesPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function text(fixture: { nativeElement: unknown }): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function host(fixture: { nativeElement: unknown }): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

/**
 * Tape dans le champ dont l'étiquette commence par `label`.
 *
 * Le rendu compte : `fold-number-input` propage sa valeur pendant la détection
 * de changements, et sauter ce temps testerait une séquence qui n'arrive dans
 * aucun navigateur.
 */
function typeInto(
  fixture: { nativeElement: unknown; detectChanges: () => void },
  label: string,
  value: string,
): void {
  const field = [...host(fixture).querySelectorAll('fold-number-input')].find((candidate) =>
    (candidate.textContent ?? '').includes(label),
  );
  const input = field?.querySelector('input');
  if (input === null || input === undefined) {
    throw new Error(`Aucun champ nombre dont l'étiquette contient « ${label} ».`);
  }
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  fixture.detectChanges();
}

/** Le bouton d'enregistrement — le seul de l'écran. */
function submitButton(fixture: { nativeElement: unknown }): HTMLButtonElement | null {
  return host(fixture).querySelector('button[foldButton]');
}

describe('AccountingRulesPage — jamais réglé', () => {
  /**
   * Le cas qui compte : rien réglé doit se LIRE comme un manque. Afficher
   * « −0 % » ou « 100 % » affirmerait que le pro paie le prix public, une
   * décision que personne n'a prise.
   */
  it('affiche « à régler » plutôt qu’une valeur de complaisance', async () => {
    expect(text(await render())).toContain('à régler');
  });

  it('n’offre pas d’aperçu tant que rien n’est saisi', async () => {
    expect(text(await render())).toContain('entre 0 et 99,99');
  });
});

describe('AccountingRulesPage — un rapport en place', () => {
  const IN_PLACE: AccountingRulesView = { ratioBp: 9_000, updatedAt: null };

  it('affiche la remise en pastille', async () => {
    expect(text(await render({ view: IN_PLACE }))).toContain('−10 %');
  });

  /**
   * L'aperçu passe par `proPriceFromPublic`, le calcul du serveur : un aperçu
   * qui arrondirait autrement que la facture serait pire qu'aucun aperçu.
   */
  it('montre ce que la remise produit sur un article à 10,00 €', async () => {
    expect(text(await render({ view: IN_PLACE }))).toContain('9,00');
  });

  /**
   * L'honnêteté sur ce qui n'est pas branché coûte une phrase ; la découvrir
   * soi-même coûte une facture.
   */
  it('dit que la remise n’est pas encore appliquée', async () => {
    expect(text(await render({ view: IN_PLACE }))).toContain('Pas encore appliquée');
  });

  /**
   * **Le simulateur des trois taux.** Ce que l'écran promet en toutes lettres —
   * « le prix affiché est comparé, pas le prix hors taxe, dont le montant dépend
   * du taux » — n'était affirmé nulle part qu'en prose. Le tableau le montre, et
   * ce cas le tient.
   *
   * Les six montants sont écrits en dur plutôt que recalculés : un test qui
   * refait l'arithmétique du code sous test ne prouve que leur accord, pas leur
   * justesse. 10,00 € TTC à 5,5 % font 9,48 € HT, et 9,00 € en font 8,53 €.
   */
  it('déduit les trois hors taxe du même prix d’étiquette', async () => {
    const rendered = text(await render({ view: IN_PLACE }));

    // Public HT : le même TTC, trois parts de taxe.
    expect(rendered).toContain('9,48');
    expect(rendered).toContain('9,09');
    expect(rendered).toContain('8,33');
    // Pro HT : déduits du pro TTC, jamais du public HT multiplié par le rapport.
    expect(rendered).toContain('8,53');
    expect(rendered).toContain('8,18');
    expect(rendered).toContain('7,50');
  });

  /**
   * 🔴 **Aucune colonne TTC dans le tableau**, et c'est le sujet : les deux prix
   * TTC ne bougent pas d'une ligne à l'autre. Les répéter trois fois ferait
   * chercher une différence qui n'existe pas — alors que l'absence de variation
   * est justement ce que le simulateur démontre.
   */
  it('ne répète pas les prix TTC, qui ne varient pas', async () => {
    const rendered = text(await render({ view: IN_PLACE }));

    expect(rendered).toContain('TVA');
    expect(rendered).toContain('Public HT');
    expect(rendered).toContain('Pro HT');
    expect(rendered).not.toContain('Public TTC');
  });

  /** Sans saisie posable, pas de tableau : il n'y aurait aucun pro à déduire. */
  it('n’affiche aucun simulateur tant que rien n’est saisi', async () => {
    expect(text(await render())).not.toContain('Public HT');
  });

  /**
   * **Le prix se saisit** : la question d'un commercial porte sur SON article,
   * pas sur un article rond. 2,40 € à −10 % font 2,16 € TTC, dont 2,05 € HT à
   * 5,5 % — trois nombres qu'aucune valeur en dur ne pouvait donner.
   *
   * 🔴 On tape dans le CHAMP, on ne pousse pas dans le signal : un test qui
   * atteindrait l'état interne prouverait que le calcul est juste, pas que
   * l'écran le déclenche. Et il demanderait un cast, que `lint:no-type-escapes`
   * refuse à raison.
   */
  it('recalcule tout sur le prix saisi', async () => {
    const fixture = await render({ view: IN_PLACE });

    typeInto(fixture, 'Sur un article', '2.4');

    const rendered = text(fixture);
    expect(rendered).toContain('2,40');
    expect(rendered).toContain('2,16');
    expect(rendered).toContain('2,05');
  });

  /**
   * 🔴 **Le prix ne s'enregistre pas**, et rien dans cet écran ne le persiste :
   * ce n'est pas une décision, c'est une question. Le confondre avec la remise
   * ferait croire qu'on règle un prix sur un écran qui ne pose qu'un rapport,
   * valable pour tout le catalogue — d'où ce cas sur le bouton.
   */
  it('ne rend pas l’écran enregistrable quand seul le prix change', async () => {
    const fixture = await render({ view: IN_PLACE });

    typeInto(fixture, 'Sur un article', '2.4');

    expect(submitButton(fixture)?.disabled).toBe(true);
  });

  /** Un prix nul n'est pas une question : une colonne de zéros ressemble à une panne. */
  it('refuse un prix à zéro plutôt que d’afficher des zéros', async () => {
    const fixture = await render({ view: IN_PLACE });

    typeInto(fixture, 'Sur un article', '0');

    expect(text(fixture)).toContain('au-dessus de zéro');
  });
});

describe('AccountingRulesPage — sans le droit comptable', () => {
  it('n’offre pas le formulaire, et dit lequel manque', async () => {
    const fixture = await render({ granted: false });
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('fold-number-input')).toBeNull();
    expect(host.textContent).toContain('pim_tax:write');
  });
});

describe('AccountingRulesPage — lecture en échec', () => {
  /**
   * « Illisible » n'est pas « jamais réglé » : les deux affichent un blanc,
   * mais proposer le formulaire ici écraserait un réglage qu'on n'a pas su
   * lire.
   */
  it('ne propose rien à la saisie quand le réglage n’a pas pu être lu', async () => {
    const fixture = await render({ fails: true });
    const host = fixture.nativeElement as HTMLElement;

    expect(host.textContent).toContain('Réglage illisible');
    expect(host.querySelector('fold-number-input')).toBeNull();
  });
});
