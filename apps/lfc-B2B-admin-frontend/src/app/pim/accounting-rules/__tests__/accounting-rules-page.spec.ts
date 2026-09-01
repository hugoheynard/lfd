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
