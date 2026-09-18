import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  AdminFeatureAccessView,
  AdminFeatureView,
  FeatureExemptionView,
  StaffPermission,
} from '@lfd/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { FeatureAccessPage } from '../feature-access-page/feature-access-page';
import { FeatureAccessService } from '../feature-access.service';

/**
 * Ce que ces cas tiennent :
 *
 * - 🔴 **en lecture seule, aucun contrôle d'écriture n'existe** — ni sélecteur,
 *   ni champ, ni bouton grisé — et une phrase dit pourquoi ;
 * - **« Revenir au défaut » n'apparaît que sur une dérogation** : sans elle, il
 *   n'y a pas de défaut vers lequel revenir ;
 * - 🔴 **l'état du compte d'une adresse exemptée se lit** : le runbook exige
 *   de voir « vérifiée » avant de fermer la boutique ;
 * - 🔴 **une ligne hors catalogue est signalée, jamais peinte en réglage** ;
 * - un refus du serveur est notifié, et l'écran relit au lieu de garder le
 *   geste refusé.
 */

const AUTHOR = { name: 'Hugo Heynard', role: 'admin' };

function exemption(over: Partial<FeatureExemptionView> = {}): FeatureExemptionView {
  return {
    id: 'ex_1',
    email: 'testeur@lfc.test',
    createdAt: '2026-09-14T08:00:00.000Z',
    createdBy: AUTHOR,
    accountState: 'verified',
    ...over,
  };
}

function shop(over: Partial<AdminFeatureView> = {}): AdminFeatureView {
  return {
    key: 'shop',
    label: 'Boutique',
    description: 'Ce que les clients peuvent faire de la boutique en ligne.',
    levels: ['closed', 'browse', 'order'],
    defaultLevel: 'order',
    effectiveLevel: 'order',
    exemptible: true,
    override: null,
    exemptions: [],
    ...over,
  };
}

function board(over: Partial<AdminFeatureAccessView> = {}): AdminFeatureAccessView {
  return { features: [shop()], ignored: [], ...over };
}

class FakeFeatureAccess {
  current: AdminFeatureAccessView = board();
  refuse = false;
  readonly board = vi.fn(async () => this.current);
  readonly setOverride = vi.fn(async () => this.answer());
  readonly clearOverride = vi.fn(async () => this.answer());
  readonly addExemption = vi.fn(async () => this.answer());
  readonly removeExemption = vi.fn(async () => this.answer());

  private answer(): AdminFeatureAccessView {
    if (this.refuse) {
      throw new Error('refusé');
    }
    return this.current;
  }
}

interface Harness {
  readonly fixture: ComponentFixture<FeatureAccessPage>;
  readonly api: FakeFeatureAccess;
  readonly notifyError: ReturnType<typeof vi.fn>;
}

async function render(
  current: AdminFeatureAccessView,
  permissions: readonly StaffPermission[],
): Promise<Harness> {
  const api = new FakeFeatureAccess();
  api.current = current;
  const notifyError = vi.fn();
  const store: Pick<PermissionsStore, 'can'> = {
    can: (permission: StaffPermission): boolean => permissions.includes(permission),
  };
  TestBed.configureTestingModule({
    imports: [FeatureAccessPage],
    providers: [
      { provide: FeatureAccessService, useValue: api },
      { provide: PermissionsStore, useValue: store },
      { provide: NotifyService, useValue: { success: () => undefined, error: notifyError } },
    ],
  });
  const fixture = TestBed.createComponent(FeatureAccessPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, api, notifyError };
}

const READER: readonly StaffPermission[] = ['b2b_feature_access:read'];
const WRITER: readonly StaffPermission[] = ['b2b_feature_access:read', 'b2b_feature_access:write'];

const host = (fixture: ComponentFixture<FeatureAccessPage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const text = (fixture: ComponentFixture<FeatureAccessPage>): string =>
  host(fixture).textContent ?? '';

const buttonSaying = (
  fixture: ComponentFixture<FeatureAccessPage>,
  label: string,
): HTMLButtonElement | null =>
  [...host(fixture).querySelectorAll('button')].find((button) =>
    (button.textContent ?? '').includes(label),
  ) ?? null;

describe('FeatureAccessPage', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('en lecture seule', () => {
    it("n'offre aucun contrôle d'écriture, et dit pourquoi", async () => {
      const { fixture } = await render(
        board({
          features: [
            shop({
              effectiveLevel: 'browse',
              override: {
                value: 'browse',
                updatedAt: '2026-09-14T09:00:00.000Z',
                updatedBy: AUTHOR,
              },
              exemptions: [exemption()],
            }),
          ],
        }),
        READER,
      );

      const root = host(fixture);
      expect(root.querySelector('fold-listbox')).toBeNull();
      expect(root.querySelector('fold-input')).toBeNull();
      expect(root.querySelector('fold-inline-confirm')).toBeNull();
      expect(buttonSaying(fixture, 'Revenir au défaut')).toBeNull();
      expect(buttonSaying(fixture, 'Ajouter')).toBeNull();
      expect(text(fixture)).toContain('Lecture seule');
      // Ce qu'il doit pouvoir dire à un client reste lisible.
      expect(text(fixture)).toContain('Voir');
      expect(text(fixture)).toContain('Posé par Hugo Heynard');
      expect(text(fixture)).toContain('testeur@lfc.test');
    });
  });

  describe('en écriture', () => {
    it('offre le sélecteur et le champ, sans phrase de lecture seule', async () => {
      const { fixture } = await render(board(), WRITER);

      expect(host(fixture).querySelector('fold-listbox')).not.toBeNull();
      expect(host(fixture).querySelector('fold-input')).not.toBeNull();
      expect(text(fixture)).not.toContain('Lecture seule');
    });

    /**
     * 2026-09-14 : le serveur refuse en 409 une exemption sur une clé non
     * exemptible (le mandat client). L'écran ne propose donc pas le geste, et
     * dit pourquoi.
     */
    it('ne propose pas d’exemption sur une clé non exemptible, et dit pourquoi', async () => {
      const { fixture } = await render(
        board({
          features: [
            shop({
              key: 'customerMandate',
              label: 'Mandat SEPA client',
              levels: ['closed', 'open'],
              defaultLevel: 'closed',
              effectiveLevel: 'closed',
              exemptible: false,
            }),
          ],
        }),
        WRITER,
      );

      expect(host(fixture).querySelector('fold-listbox')).not.toBeNull();
      expect(host(fixture).querySelector('fold-input')).toBeNull();
      expect(buttonSaying(fixture, 'Ajouter')).toBeNull();
      expect(text(fixture)).toContain('Aucune exemption ne s');
      expect(text(fixture)).toContain('Fermé');
    });

    it('dit « Défaut du code » sans offrir de retour au défaut quand rien n’est posé', async () => {
      const { fixture } = await render(board(), WRITER);

      expect(text(fixture)).toContain('Défaut du code');
      expect(buttonSaying(fixture, 'Revenir au défaut')).toBeNull();
    });

    it('nomme qui a posé la dérogation, et offre le retour au défaut', async () => {
      const { fixture, api } = await render(
        board({
          features: [
            shop({
              effectiveLevel: 'closed',
              override: {
                value: 'closed',
                updatedAt: '2026-09-14T09:00:00.000Z',
                updatedBy: AUTHOR,
              },
            }),
          ],
        }),
        WRITER,
      );

      expect(text(fixture)).toContain('Posé par Hugo Heynard le');
      const revert = buttonSaying(fixture, 'Revenir au défaut');
      expect(revert).not.toBeNull();
      revert?.click();
      await fixture.whenStable();
      expect(api.clearOverride).toHaveBeenCalledWith('shop');
    });

    it('ne pose rien quand on choisit le niveau déjà en vigueur', async () => {
      const { fixture, api } = await render(board(), WRITER);
      const card = fixture.componentInstance['cards']()[0];
      expect(card).toBeDefined();
      if (card === undefined) {
        return;
      }

      await fixture.componentInstance['chooseLevel'](card, 'order');
      expect(api.setOverride).not.toHaveBeenCalled();

      await fixture.componentInstance['chooseLevel'](card, 'browse');
      expect(api.setOverride).toHaveBeenCalledWith('shop', 'browse');
    });

    it('notifie un refus et relit, au lieu de garder le geste refusé', async () => {
      const { fixture, api, notifyError } = await render(board(), WRITER);
      const card = fixture.componentInstance['cards']()[0];
      if (card === undefined) {
        throw new Error('carte absente');
      }
      api.refuse = true;
      const readsBefore = api.board.mock.calls.length;

      await fixture.componentInstance['chooseLevel'](card, 'closed');

      expect(notifyError).toHaveBeenCalledTimes(1);
      expect(api.board.mock.calls.length).toBe(readsBefore + 1);
      // Le sélecteur est reconstruit : il ne montre plus le choix refusé.
      expect(fixture.componentInstance['revision']()).toBe(1);
    });

    it("ajoute l'adresse saisie, sans espaces, et vide le champ", async () => {
      const { fixture, api } = await render(board(), WRITER);
      const page = fixture.componentInstance;
      const card = page['cards']()[0];
      if (card === undefined) {
        throw new Error('carte absente');
      }

      page['setDraft']('shop', '  testeur@lfc.test ');
      await page['addExemption'](card);

      expect(api.addExemption).toHaveBeenCalledWith('shop', 'testeur@lfc.test');
      expect(page['draft']('shop')).toBe('');
    });

    it("garde l'adresse saisie quand l'ajout est refusé", async () => {
      // L'administrateur corrige une faute de frappe ; la lui faire retaper
      // serait une punition.
      const { fixture, api } = await render(board(), WRITER);
      const page = fixture.componentInstance;
      const card = page['cards']()[0];
      if (card === undefined) {
        throw new Error('carte absente');
      }
      api.refuse = true;

      page['setDraft']('shop', 'pas-une-adresse');
      await page['addExemption'](card);

      expect(page['draft']('shop')).toBe('pas-une-adresse');
    });
  });

  describe('les adresses exemptées', () => {
    it("dit l'état du compte de chacune", async () => {
      const { fixture } = await render(
        board({
          features: [
            shop({
              exemptions: [
                exemption({ id: 'a', email: 'ok@lfc.test', accountState: 'verified' }),
                exemption({ id: 'b', email: 'pas-encore@lfc.test', accountState: 'unverified' }),
                exemption({ id: 'c', email: 'inconnu@lfc.test', accountState: 'none' }),
              ],
            }),
          ],
        }),
        READER,
      );

      const badges = [...host(fixture).querySelectorAll('fold-badge')].map((badge) =>
        (badge.textContent ?? '').trim(),
      );
      expect(badges).toEqual(['vérifiée', 'non vérifiée', 'aucun compte']);
      expect(text(fixture)).toContain('Elles doivent être vérifiées pour compter.');
    });

    it("nomme l'adresse dans la confirmation de retrait", async () => {
      const { fixture } = await render(
        board({ features: [shop({ exemptions: [exemption({ email: 'retire@lfc.test' })] })] }),
        WRITER,
      );
      const page = fixture.componentInstance;
      const row = page['cards']()[0]?.exemptions[0];
      if (row === undefined) {
        throw new Error('ligne absente');
      }

      expect(page['removeMessage'](row)).toContain('retire@lfc.test');
    });
  });

  describe('ce que le catalogue ne sait pas lire', () => {
    it('signale une ligne ignorée par le serveur sans la peindre en réglage', async () => {
      const { fixture } = await render(
        board({
          ignored: [
            { table: 'override', key: 'loyalty', detail: 'on', reason: 'unknown_key' },
            { table: 'exemption', key: 'loyalty', detail: 'x@lfc.test', reason: 'unknown_key' },
          ],
        }),
        WRITER,
      );

      expect(host(fixture).querySelectorAll('fold-card')).toHaveLength(1);
      expect(text(fixture)).toContain('ne correspondent pas au catalogue');
      expect(text(fixture)).toContain('« loyalty = on »');
      expect(text(fixture)).toContain('x@lfc.test');
    });

    it('signale une clé que le serveur renvoie et que cet écran ne connaît pas', async () => {
      // Contrat en avance d'un déploiement : on ne devine pas les niveaux. La
      // clé arrive du FIL, donc hors du type — d'où le passage par JSON plutôt
      // qu'un cast, qui mentirait sur la provenance.
      const wire: AdminFeatureAccessView = JSON.parse(
        JSON.stringify(board({ features: [shop(), shop()] })).replace(
          /"key":"shop"(?![\s\S]*"key":"shop")/,
          '"key":"loyalty"',
        ),
      );
      const { fixture } = await render(wire, WRITER);

      expect(host(fixture).querySelectorAll('fold-card')).toHaveLength(1);
      expect(text(fixture)).toContain('« loyalty » : cet écran ne la connaît pas');
    });
  });

  describe('les états de la vue', () => {
    it("tombe sur l'erreur fold quand la première lecture échoue", async () => {
      const api = new FakeFeatureAccess();
      api.board.mockRejectedValue(new Error('injoignable'));
      TestBed.configureTestingModule({
        imports: [FeatureAccessPage],
        providers: [
          { provide: FeatureAccessService, useValue: api },
          { provide: PermissionsStore, useValue: { can: () => true } },
          { provide: NotifyService, useValue: { error: () => undefined } },
        ],
      });
      const fixture = TestBed.createComponent(FeatureAccessPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(host(fixture).querySelector('fold-empty-state')).not.toBeNull();
      expect(buttonSaying(fixture, 'Réessayer')).not.toBeNull();
    });

    it('montre le vide fold quand le catalogue ne porte rien', async () => {
      const { fixture } = await render(board({ features: [] }), WRITER);

      expect(host(fixture).querySelector('fold-empty-state')).not.toBeNull();
      expect(text(fixture)).toContain('Aucune fonctionnalité au catalogue');
    });
  });
});
