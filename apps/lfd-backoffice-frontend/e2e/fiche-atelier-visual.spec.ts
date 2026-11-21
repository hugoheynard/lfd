import { expect, test, type Page } from '@playwright/test';

import { FicheAtelierApiDouble, WORKSHOP_TIMEZONE } from './fiche-atelier-api';

/**
 * **La fiche d'atelier, comparée à l'image** — pour voir une régression
 * visuelle que ni Vitest ni le build ne voient.
 *
 * ## Les références sont des images LINUX
 *
 * La CI tourne sur ubuntu-latest : une référence prise sur macOS y échouerait
 * sur l'anticrénelage des polices. Elles se régénèrent donc dans le conteneur
 * officiel Playwright, à la version du catalogue :
 *
 * ```bash
 * pnpm --filter lfd-backoffice-frontend test:visual:update
 * ```
 *
 * Ce que fait la commande : elle monte le dépôt en `/src`, en recopie les
 * sources (sans `node_modules`, `.git`, `dist`, `graphify-out`) dans le disque
 * du conteneur, y fait un `pnpm install` filtré sur le back-office — le
 * magasin pnpm vit dans le volume nommé `lfd-visual-pnpm-store`, pour que la
 * fois suivante ne retélécharge rien —, construit les paquets du dépôt, lance
 * ce spec en `--update-snapshots`, puis recopie le seul dossier des images
 * dans `/src`. Les `node_modules` macOS de l'hôte ne sont jamais touchés.
 *
 * `test:visual:docker` fait la même chose sans mettre à jour : la preuve que
 * les références passent. `test:visual` lance le spec sur la machine — utile
 * sous Linux seulement.
 */

test.use({ timezoneId: WORKSHOP_TIMEZONE, locale: 'fr-FR' });

const VIEWPORTS = [
  { name: 'poste', width: 1280, height: 800 },
  { name: 'telephone', width: 390, height: 844 },
] as const;

const VIEWS = [
  { name: 'produit', label: 'Par produit' },
  { name: 'tranche', label: 'Par tranche' },
] as const;

/** La fiche ouverte, API doublée, horloge gelée. */
async function openSheet(page: Page): Promise<void> {
  await new FicheAtelierApiDouble().install(page);
  await page.goto('/fournil');
  await expect(page.getByText('Croissant au beurre').first()).toBeVisible();
}

for (const viewport of VIEWPORTS) {
  test.describe(`fiche d'atelier — ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const view of VIEWS) {
      test(`vue « ${view.label} »`, async ({ page }) => {
        await openSheet(page);
        await page.locator('fold-view-toggle').getByText(view.label).click();

        await expect(page).toHaveScreenshot(`fiche-atelier-${view.name}-${viewport.name}.png`, {
          animations: 'disabled',
          caret: 'hide',
          // L'horloge murale bouge à la seconde ; gelée, elle reste masquée
          // pour qu'un réglage de format ne casse pas toutes les images.
          mask: [page.locator('app-workshop-wall-clock')],
        });
      });
    }
  });
}
