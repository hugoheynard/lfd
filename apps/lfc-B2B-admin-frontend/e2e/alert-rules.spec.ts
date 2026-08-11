import { expect, test } from '@playwright/test';

import { AdminApiDouble, COMPANY_ID } from './admin-api';

/**
 * Les **règles d'alerte**, éprouvées dans un vrai navigateur.
 *
 * On y met ce que Vitest ne peut pas tenir : un focus qui quitte réellement un
 * champ (l'éditeur de paliers ne range qu'au `focusout`), un `<select>` natif
 * qu'on ouvre, et l'enchaînement des trois états d'une dérogation d'un écran à
 * l'autre.
 */

test.describe("réglage global d'un type", () => {
  test('enregistre la valeur saisie et la relit', async ({ page }) => {
    const api = new AdminApiDouble();
    await api.install(page);

    await page.goto('/reglages/commercial');
    // Onglets NON routés : ce sont des vues d'un même écran de réglages, donc
    // des boutons, pas des liens.
    await page.getByRole('button', { name: 'Alertes' }).click();

    const drift = page.locator('.ar-rule', { hasText: 'Écart à sa moyenne' });
    const baseline = drift.getByLabel('Moyenne sur N commandes');
    await baseline.fill('9');
    await drift.getByRole('button', { name: 'Enregistrer' }).click();

    await expect.poll(() => api.savedGlobals.length).toBe(1);
    const saved = api.savedGlobals[0];
    expect(saved?.params.kind).toBe('product.quantity_drift');
    expect(saved?.params).toMatchObject({ baselineOrders: 9 });

    // Rechargée depuis le serveur : c'est la preuve que l'écran affiche ce qui
    // est enregistré, et non ce qu'il gardait en mémoire.
    await page.reload();
    // Onglets NON routés : ce sont des vues d'un même écran de réglages, donc
    // des boutons, pas des liens.
    await page.getByRole('button', { name: 'Alertes' }).click();
    await expect(drift.getByLabel('Moyenne sur N commandes')).toHaveValue('9');
  });

  test("range l'échelle de paliers quand on quitte le champ", async ({ page }) => {
    const api = new AdminApiDouble();
    await api.install(page);

    await page.goto('/reglages/commercial');
    // Onglets NON routés : ce sont des vues d'un même écran de réglages, donc
    // des boutons, pas des liens.
    await page.getByRole('button', { name: 'Alertes' }).click();

    const drift = page.locator('.ar-rule', { hasText: 'Écart à sa moyenne' });
    // Par position dans l'échelle de hausse : c'est un tableau de paliers, et
    // ses deux champs portent le même libellé d'une ligne à l'autre.
    const rise = drift.locator('.tt-field').first();
    const bound = (index: number) => rise.locator('.tt-row').nth(index).locator('input').first();
    const firstBound = bound(0);

    // 2 → 30 : le premier palier passe DERRIÈRE le deuxième (10). Le tri ne doit
    // pas se produire à la frappe — la ligne éditée sauterait sous le curseur —
    // mais au moment où le champ perd le focus.
    await firstBound.fill('30');
    await expect(firstBound).toHaveValue('30');
    await firstBound.blur();

    await expect(bound(0)).toHaveValue('10');
    await expect(bound(1)).toHaveValue('30');
  });
});

test.describe('dérogation sur un compte', () => {
  const alertsTab = `/comptes-clients/${COMPANY_ID}/alertes`;

  test('les trois états se suivent : héritée, éteinte, propre au compte', async ({ page }) => {
    const api = new AdminApiDouble();
    await api.install(page);

    await page.goto(alertsTab);
    const card = page.locator('app-account-alert-card', { hasText: 'Écart à sa moyenne' });

    // 1. Héritée — aucune ligne n'existe, la carte le dit.
    await expect(card).toContainText('Ce compte suit le réglage de la plateforme');

    // 2. Éteinte sur ce compte : le bouton d'activation ne demande pas de passer
    //    par l'éditeur, c'est un axe indépendant du réglage.
    await card.getByText('Activée sur ce compte').click();
    await expect.poll(() => api.savedOverrides.length).toBe(1);
    expect(api.savedOverrides[0]).toMatchObject({ mode: 'off' });

    // 3. Propre au compte : on modifie ICI, et le compte porte sa règle.
    await card.getByRole('button', { name: 'Modifier sur ce compte' }).click();
    await card.getByLabel('Moyenne sur N commandes').fill('4');
    await card.getByRole('button', { name: 'Enregistrer' }).click();

    await expect.poll(() => api.savedOverrides.length).toBe(2);
    expect(api.savedOverrides[1]).toMatchObject({ mode: 'custom' });
    await expect(card).toContainText('Revenir au réglage global');
  });

  test('revenir au global SUPPRIME la dérogation', async ({ page }) => {
    const api = new AdminApiDouble();
    await api.install(page);

    await page.goto(alertsTab);
    const card = page.locator('app-account-alert-card', { hasText: 'Écart à sa moyenne' });
    await card.getByText('Activée sur ce compte').click();
    await expect(card.getByRole('button', { name: 'Revenir au réglage global' })).toBeVisible();

    await card.getByRole('button', { name: 'Revenir au réglage global' }).click();

    // L'absence EST l'héritage : on efface la ligne, on n'écrit pas un mode
    // « hérité » qui donnerait deux façons de dire la même chose.
    await expect.poll(() => api.clearedOverrides).toContain('product.quantity_drift');
  });
});
