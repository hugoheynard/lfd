import { expect, test, type Page } from '@playwright/test';

import { COMPANY_ID, ComptesApiDouble, listedCompany } from './comptes-api';

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

/** Le champ qui désigne le détenteur : son adresse, et rien d'autre. */
function adresseDetenteur(page: Page) {
  return page.getByLabel('E-mail du détenteur');
}

test.describe('ouvrir un compte devant le client', () => {
  test("s'ouvre SANS papiers, avec un détenteur créé à la volée", async ({ page }) => {
    // Le frein commercial qu'on a levé : exiger SIRET et forme juridique
    // renverrait le commercial dans sa voiture, et le compte ne serait jamais
    // ouvert.
    const api = new ComptesApiDouble();
    await ouverture(page, api);

    await adresseDetenteur(page).fill('jean@comptoir.fr');
    await page.getByRole('button', { name: 'Ouvrir le compte' }).click();

    await expect.poll(() => api.created.length).toBe(1);
    // On atterrit sur la fiche du compte — même page, sections désormais
    // complétables.
    await expect(page).toHaveURL(new RegExp(`${COMPANY_ID}/informations`));
  });

  test("ne LAISSE PAS voir qu'une adresse est déjà cliente", async ({ page }) => {
    // Le cœur de la règle de confidentialité : dire « elle a déjà un espace »
    // apprendrait au commercial que ce comptable travaille avec un autre de nos
    // clients. L'écran doit donc être identique dans les deux cas.
    const connu = new ComptesApiDouble();
    connu.knownEmails.push('claire@vasseur.fr');
    await ouverture(page, connu);
    await adresseDetenteur(page).fill('claire@vasseur.fr');
    await page.getByRole('button', { name: 'Ouvrir le compte' }).click();
    const messageConnu = await page.locator('fold-toast').first().textContent();

    await expect.poll(() => connu.created.length).toBe(1);
    expect(messageConnu).not.toContain('existant');
    expect(messageConnu).not.toContain('Vasseur');
  });

  test("DIT que l'e-mail n'est pas parti au lieu de l'arrondir", async ({ page }) => {
    // Un « c'est envoyé ! » de politesse ferait attendre au client un message
    // qui n'arrivera jamais.
    const api = new ComptesApiDouble();
    api.mailSent = false;
    await ouverture(page, api);

    await adresseDetenteur(page).fill('jean@comptoir.fr');
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

/** Le déclencheur du listbox « Rôle dans la société ». */
function roleField(page: Page): ReturnType<Page['getByRole']> {
  return page
    .locator('fold-listbox')
    .filter({ hasText: 'Rôle dans la société' })
    .getByRole('button')
    .first();
}

test.describe('ajouter un interlocuteur', () => {
  test("exige le RÔLE, et l'e-mail seul suffit pour le reste", async ({ page }) => {
    const api = new ComptesApiDouble();
    await fiche(page, api);

    await page.getByRole('button', { name: 'Ajouter un contact' }).click();
    await page.getByLabel('E-mail').fill('lea@comptoir.fr');

    // `exact` : la fiche porte aussi « Enregistrer un mandat », et un nom
    // partiel attraperait les deux.
    const enregistrer = page.getByRole('button', { name: 'Enregistrer', exact: true });
    // Sans rôle, on ne saurait pas quoi lui ouvrir plus tard.
    await expect(enregistrer).toBeDisabled();

    // Le rôle se choisit dans un listbox du DS : on ouvre, on clique la ligne.
    // Le déclencheur est un bouton dont le nom accessible est la valeur affichée
    // — on passe donc par le champ, repéré à son libellé.
    await roleField(page).click();
    await page.getByRole('option', { name: 'Facturation' }).click();
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
    await roleField(page).click();

    // Les rôles sont là — mais pas celui-là : une société a un détenteur, un
    // seul, et il n'est pas attribuable depuis ce formulaire.
    await expect(page.getByRole('option', { name: 'Facturation' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Détenteur du compte' })).toHaveCount(0);
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

test.describe('retirer un moyen de paiement', () => {
  test('exige de taper le mot exact, et ne le propose PAS ailleurs', async ({ page }) => {
    // Retirer un crédit se répare mal et se découvre au pire moment : à la
    // commande suivante. Le geste vit donc en zone de danger, à distance des
    // boutons ordinaires, et derrière une saisie.
    const api = new ComptesApiDouble();
    api.grantedTerms = ['monthly'];
    await fiche(page, api);

    const zone = page.locator('fold-danger-zone');
    await expect(zone).toBeVisible();

    // Nulle part ailleurs sur la fiche on ne peut retirer ce crédit.
    await expect(page.getByRole('button', { name: 'Retirer' })).toHaveCount(1);

    await zone.getByRole('button', { name: 'Retirer' }).click();
    const confirmer = zone.getByRole('button', { name: 'Retirer', exact: true }).last();

    // Tant que le mot n'est pas tapé, la confirmation reste hors d'atteinte.
    await expect(confirmer).toBeDisabled();
    await zone.getByRole('textbox').fill('Mensuel');
    await expect(confirmer).toBeEnabled();
  });

  test("ne montre AUCUNE zone de danger quand il n'y a rien à retirer", async ({ page }) => {
    // Une section « dangereuse » toujours affichée cesse d'être lue.
    const api = new ComptesApiDouble();
    await fiche(page, api);

    await expect(page.getByText('Moyens de paiement')).toBeVisible();
    await expect(page.locator('fold-danger-zone')).toHaveCount(0);
  });
});

test.describe("préférence d'acheminement", () => {
  test('enregistre le réglage SANS renvoyer le commercial en haut de page', async ({ page }) => {
    // Recharger la fiche en la remplaçant par un « Chargement… » la démonte, et
    // la position de lecture est perdue : le commercial se retrouvait au sommet,
    // à chercher où il en était.
    //
    // On mesure la position À L'ÉCRAN de la section plutôt qu'un `scrollY` : la
    // page défile dans le shell, pas dans la fenêtre, et un test qui interroge
    // le mauvais conteneur ne prouve rien.
    const api = new ComptesApiDouble();
    await fiche(page, api);

    const section = page.getByText("Préférences d'acheminement");
    await section.scrollIntoViewIfNeeded();
    const before = await section.boundingBox();

    await page.getByRole('button', { name: 'Retrait', exact: true }).click();

    await expect.poll(() => api.preference.method).toBe('pickup');
    // La section est toujours là — la fiche n'a pas été démontée…
    await expect(section).toBeVisible();
    // …et elle n'a pas bougé sous les yeux du commercial.
    const after = await section.boundingBox();
    expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(2);
  });
});

test.describe('corriger une adresse de livraison', () => {
  test('ouvre le panneau PRÉREMPLI et enregistre la correction', async ({ page }) => {
    // Le bouton « Modifier » de la carte existait mais n'était branché à rien
    // côté staff : il s'affichait, se cliquait, et ne faisait rien. Une action
    // qui ne répond pas est pire qu'une action absente.
    const api = new ComptesApiDouble();
    api.deliveries = [
      {
        id: 'addr_1',
        label: 'Boutique',
        ligne1: '4 rue du Marché',
        ligne2: '',
        codePostal: '75011',
        ville: 'Paris',
        pays: 'France',
        isDefault: true,
        specs: {
          note: '',
          slots: { mode: 'everyday', slot: { start: '08:00', end: '11:00' } },
          deliveryContact: { prenom: 'Léa', nom: 'Martin', telephone: '0600000000' },
          gps: null,
        },
      },
    ];
    await fiche(page, api);

    await page.getByRole('button', { name: "Actions de l'adresse" }).click();
    // `visible` : les menus fermés des autres lignes restent dans le DOM, et
    // « Modifier » y figure aussi — seul celui qu'on vient d'ouvrir est cliquable.
    await page.getByRole('menuitem', { name: 'Modifier' }).filter({ visible: true }).click();

    // Prérempli : un formulaire vide obligerait à tout retaper pour changer un
    // code d'accès, et ce qui se retape se perd.
    await expect(page.getByText('Modifier l’adresse de livraison')).toBeVisible();
    const nom = page.getByLabel("Nom de l'adresse");
    await expect(nom).toHaveValue('Boutique');

    await nom.fill('Boutique (rue du Marché)');
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();

    await expect.poll(() => api.updatedDeliveries.length).toBe(1);
    expect(api.updatedDeliveries[0]?.[0]).toBe('addr_1');
  });
});

test.describe('la liste au téléphone', () => {
  // 390×844 : un iPhone récent. Le seuil de bascule de la table est à 768px —
  // on éprouve donc bien la vue étroite, pas une table un peu serrée.
  test.use({ viewport: { width: 390, height: 844 } });

  test('remplace la table par des CARTES, jamais un tableau à faire défiler', async ({ page }) => {
    // Sept colonnes sur 390 px, c'est un défilement horizontal — donc des
    // colonnes qu'on ne voit pas, et un nom qu'on perd en cherchant le statut.
    const api = new ComptesApiDouble();
    api.listed = [listedCompany()];
    await api.install(page);
    await page.goto('/comptes-clients');

    // On lit DANS la carte : la table reste dans le DOM (fold la masque en CSS),
    // donc un `getByText` global trouverait les deux et ne prouverait rien.
    const carte = page.locator('a.rc');
    await expect(carte).toContainText('Le Comptoir');
    await expect(carte).toContainText('C-CPT01');
    await expect(page.locator('table')).toBeHidden();
  });

  test('la carte ENTIÈRE mène à la fiche, pas seulement le nom', async ({ page }) => {
    // Au pouce, on tape la carte : un lien posé sur le seul nom demanderait de
    // viser une ligne de texte.
    const api = new ComptesApiDouble();
    api.listed = [listedCompany()];
    await api.install(page);
    await page.goto('/comptes-clients');

    const carte = page.locator('a.rc');
    await expect(carte).toHaveAttribute('href', `/comptes-clients/${COMPANY_ID}`);
    const boite = await carte.boundingBox();
    expect(boite?.width ?? 0).toBeGreaterThan(300);
  });
});
