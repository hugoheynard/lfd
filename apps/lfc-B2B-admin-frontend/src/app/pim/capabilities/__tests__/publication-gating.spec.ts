import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { WorkspaceCatalogue } from '../../../shared/workspace-rail/workspaces';
import { PimCapabilitiesStore } from '../pim-capabilities.store';

/**
 * **Ce que le déploiement offre n'est pas un droit.**
 *
 * Deux filtres distincts sur la même table : `needs` demande à la personne,
 * `needsPublication` demande à l'installation. Les confondre ferait chercher
 * une permission manquante là où il n'en manque aucune — et laisserait un
 * administrateur croire qu'il peut rouvrir un écran qui n'a rien derrière lui.
 */
function views(publication: boolean, canWrite = true): string[] {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: PermissionsStore, useValue: { can: () => canWrite } },
      { provide: PimCapabilitiesStore, useValue: { publication: () => publication } },
    ],
  });
  return TestBed.inject(WorkspaceCatalogue)
    .views('pim')()
    .map((view) => view.key);
}

describe('le rail du référentiel face au drapeau de publication', () => {
  it('retire les vues de Diffusion quand la publication est fermée', () => {
    const keys = views(false);

    expect(keys).not.toContain('collections');
    expect(keys).not.toContain('publication');
    expect(keys).not.toContain('integration');
  });

  /**
   * Le mur ne doit pas déborder : c'est tout l'objet du drapeau. On ferme ce
   * qui SORT — la saisie reste entière, sinon le déploiement où l'on veut
   * justement remplir le catalogue serait celui qui l'en empêche.
   */
  it('garde intact tout ce qui sert à SAISIR', () => {
    const keys = views(false);

    for (const key of ['overview', 'produits', 'categories', 'ingredients', 'appellations']) {
      expect(keys, `« ${key} » a disparu avec la publication`).toContain(key);
    }
  });

  it('les rend quand la publication est ouverte', () => {
    const keys = views(true);

    expect(keys).toContain('publication');
    expect(keys).toContain('collections');
  });

  /**
   * Les révisions RESTENT : ce qui est fermé, c'est poser une ancre, pas
   * relire celles qui existent. Un historique n'est pas une publication.
   */
  it('laisse les révisions lisibles, publication fermée', () => {
    expect(views(false)).toContain('revisions');
  });
});
