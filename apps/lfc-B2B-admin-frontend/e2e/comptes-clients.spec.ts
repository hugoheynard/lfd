import { expect, test, type Page } from '@playwright/test';

import { COMPANY_ID, ComptesApiDouble, knownCustomer } from './comptes-api';

/**
 * **Ouvrir un compte client**, éprouvé dans un vrai navigateur.
 *
 * Le scénario est celui du commercial chez son client : il ouvre le compte
 * devant lui, sans les papiers, et complète ensuite. Ce que Vitest ne peut pas
 * tenir et qui casse pourtant en vrai : la recherche debouncée qui remonte un
 * client existant, un `<select>` natif qu'on ouvre, une navigation d'un écran à
 * l'autre après enregistrement, et un refus serveur qui doit rester lisible.
 */

/** La page d'ouverture, API doublée, prête à saisir. */
async function ouverture(page: Page, api: ComptesApiDouble): Promise<void> {
  await api.install(page);
  await page.goto('/comptes-clients/nouveau');
  await page.getByLabel('Enseigne').fill('Le Comptoir');
}

/** La fiche d'un compte déjà ouvert. */
async function fiche(page: Page, api: ComptesApiDouble): Promise<void> {
  await api.install(page);
  await page.goto(`/comptes-clients/${COMPANY_ID}/informations`);
}

/** La carte d'un interlocuteur, repérée par son adresse. */
function carte(page: Page, email: string) {
  return page.locator('fold-card', { hasText: email });
}

/** Le champ de recherche du détenteur — par son rôle, pas par son hôte. */
function recherche(page: Page) {
  return page.getByRole('textbox', { name: 'Nom ou e-mail du client…' });
}

test.describe('ouvrir un compte devant le client', () => {
  test("s'ouvre SANS papiers, avec un détenteur créé à la volée", async ({ page }) => {
    // Le frein commercial qu'on a levé : exiger SIRET et forme juridique
    // renverrait le commercial dans sa voiture, et le compte ne serait jamais
    // ouvert.
    const api = new ComptesApiDouble();
    await ouverture(page, api);

    await recherche(page).fill('jean@comptoir.fr');
    await page.getByRole('button', { name: 'Créer ce détenteur' }).click();
    await page.getByLabel('E-mail').fill('jean@comptoir.fr');
    await page.getByRole('button', { name: 'Ouvrir le compte' }).click();

    await expect.poll(() => api.created.length).toBe(1);
    // On atterrit sur la fiche du compte — même page, sections désormais
    // complétables.
    await expect(page).toHaveURL(new RegExp(`${COMPANY_ID}/informations`));
  });

  test('rattache la société au client DÉJÀ connu plutôt que de lui refaire un compte', async ({
    page,
  }) => {
    // Deux identités pour une seule boîte e-mail, ce serait deux mots de passe
    // et deux espaces là où il en veut un.
    const api = new ComptesApiDouble();
    api.customers.push(knownCustomer('claire@vasseur.fr'));
    await ouverture(page, api);

    await recherche(page).fill('Vasseur');
    // La recherche est debouncée : c'est le résultat qu'on attend, pas un délai.
    await page.getByText('claire@vasseur.fr').click();
    await expect(page.getByText('Vasseur Traiteur SARL')).toBeVisible();

    await page.getByRole('button', { name: 'Ouvrir le compte' }).click();

    await expect(page.getByText('rejoint son espace existant')).toBeVisible();
  });

  test("DIT que l'e-mail n'est pas parti au lieu de l'arrondir", async ({ page }) => {
    // Un « c'est envoyé ! » de politesse ferait attendre au client un message
    // qui n'arrivera jamais.
    const api = new ComptesApiDouble();
    api.mailSent = false;
    await ouverture(page, api);

    await recherche(page).fill('jean@comptoir.fr');
    await page.getByRole('button', { name: 'Créer ce détenteur' }).click();
    await page.getByLabel('E-mail').fill('jean@comptoir.fr');
    await page.getByRole('button', { name: 'Ouvrir le compte' }).click();

    await expect(page.getByText("l'e-mail n'est pas parti")).toBeVisible();
  });
});

test.describe("l'accès est un état du contact, rattrapable", () => {
  test("ouvre l'accès du détenteur resté sans compte, en un clic", async ({ page }) => {
    // C'est le compte ouvert pendant que le fournisseur d'identité était
    // injoignable : le dossier existe, le client est dehors, et son adresse est
    // déjà sur la fiche.
    const api = new ComptesApiDouble();
    await fiche(page, api);

    const holder = carte(page, 'jean@comptoir.fr');
    await expect(holder.getByText("n'a pas d'accès")).toBeVisible();
    await holder.getByRole('button', { name: "Créer l'accès" }).click();

    await expect.poll(() => api.invites.length).toBe(1);
    expect(api.invites[0]).toMatchObject({ email: 'jean@comptoir.fr', role: 'owner' });
    // La fiche se recharge : les deux ticks apparaissent, le compte existe.
    await expect(holder.getByText('Compte créé')).toBeVisible();
    await expect(holder.getByText('E-mail pas encore validé')).toBeVisible();
  });

  test('renvoie le lien par le MÊME appel que l’ouverture', async ({ page }) => {
    // L'API est idempotente sur l'adresse : deux boutons pour un geste, ce
    // serait deux façons de se tromper.
    const api = new ComptesApiDouble();
    await fiche(page, api);

    const holder = carte(page, 'jean@comptoir.fr');
    await holder.getByRole('button', { name: "Créer l'accès" }).click();
    await expect(holder.getByRole('button', { name: 'Renvoyer le lien' })).toBeVisible();
    await holder.getByRole('button', { name: 'Renvoyer le lien' }).click();

    await expect.poll(() => api.invites.length).toBe(2);
    expect(api.invites[1]?.email).toBe(api.invites[0]?.email);
  });
});

test.describe('ajouter un interlocuteur', () => {
  test("exige le RÔLE, et l'e-mail seul suffit pour le reste", async ({ page }) => {
    const api = new ComptesApiDouble();
    await fiche(page, api);

    await page.getByRole('button', { name: 'Ajouter un contact' }).click();
    await page.getByLabel('E-mail').fill('lea@comptoir.fr');

    const enregistrer = page.getByRole('button', { name: 'Enregistrer' });
    // Sans rôle, on ne saurait pas quoi lui ouvrir plus tard.
    await expect(enregistrer).toBeDisabled();

    await page.getByLabel('Rôle dans la société').selectOption('billing');
    await expect(enregistrer).toBeEnabled();
    await enregistrer.click();

    await expect.poll(() => api.addedContacts.length).toBe(1);
    expect(api.addedContacts[0]).toMatchObject({ email: 'lea@comptoir.fr', role: 'billing' });
    // Aucun nom saisi : l'adresse suffit à joindre quelqu'un.
    expect(api.addedContacts[0]?.firstName).toBe('');
  });

  test('ne propose JAMAIS de faire un second détenteur', async ({ page }) => {
    const api = new ComptesApiDouble();
    await fiche(page, api);

    await page.getByRole('button', { name: 'Ajouter un contact' }).click();
    const roles = page.getByLabel('Rôle dans la société').locator('option');

    await expect(roles.filter({ hasText: 'Détenteur du compte' })).toHaveCount(0);
  });
});

test.describe("activer un compte qu'on peut appeler", () => {
  test('refuse sans numéro, puis accepte une fois joignable', async ({ page }) => {
    // Livrer une société qu'on ne peut pas joindre, c'est un camion devant une
    // porte fermée. Le serveur refuse, l'écran dit la même chose que lui.
    const api = new ComptesApiDouble();
    await fiche(page, api);

    // L'écran ne laisse même pas partir la requête : il dit la même chose que
    // le serveur, et DIT pourquoi — un bouton grisé muet est une impasse.
    const activer = page.getByRole('button', { name: 'Activer le compte' });
    await expect(activer).toBeDisabled();
    await expect(page.getByText('Aucun interlocuteur joignable')).toBeVisible();

    api.setHolderPhone('06 11 22 33 44');
    await page.reload();
    await expect(activer).toBeEnabled();
    await activer.click();

    await expect.poll(() => api.activations).toBe(1);
  });
});
