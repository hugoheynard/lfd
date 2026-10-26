import type { Page } from '@playwright/test';

import type { ShopCopyAudience, ShopCopyPreviewStep } from '@lfd/contracts/shop-copy-preview';

/**
 * Les écrans de l'échantillon RGAA qu'aucune scène de l'aperçu ne montre
 * d'emblée : on part d'une scène, puis on fait le geste d'un client.
 */
export interface ExtraScene {
  readonly name: string;
  readonly audience: ShopCopyAudience;
  readonly step: ShopCopyPreviewStep;
  readonly enter: (preview: Page) => Promise<void>;
  /** Les largeurs où le geste existe ; absent : toutes. */
  readonly widths?: readonly number[];
}

/**
 * Le pied de page n'apparaît qu'au-delà du pli (`client-shell.html`) : sous
 * 900 px, les mentions s'ouvrent par le menu, un autre chemin.
 */
const FOOTER_WIDTHS = [1280] as const;

/** Ouvre une mention du pied de page — le dialogue légal (P12). */
function mention(label: string): (preview: Page) => Promise<void> {
  return async (preview) => {
    await preview.locator('.legal-links').getByRole('button', { name: label }).click();
    await preview.getByRole('dialog').waitFor();
  };
}

/**
 * Le geste d'un client sur une scène de départ. Les noms (« Brioche », les
 * libellés des mentions) sont ceux du jeu de démonstration de l'aperçu
 * (`preview/app/demo-data/`) : si l'un change, la scène échoue en le nommant.
 */
export const EXTRA_SCENES: readonly ExtraScene[] = [
  {
    // P03 — la fiche produit, ouverte depuis le rayon.
    name: 'product-sheet',
    audience: 'visitor',
    step: 'shop',
    enter: async (preview) => {
      await preview.getByText('Brioche', { exact: true }).first().click();
      await preview.waitForURL(/\/boutique\/article\//);
    },
  },
  {
    // P11 — la connexion : le dialogue que « Se connecter » ouvre (lot A5).
    name: 'sign-in',
    audience: 'visitor',
    step: 'welcome',
    enter: async (preview) => {
      // Alt : un clic nu sur un texte de la boutique ouvre l'édition en place
      // de l'aperçu (`copy-editing.ts`) ; Alt le laisse passer à la boutique.
      await preview.locator('.sign-cta').click({ modifiers: ['Alt'] });
      await preview.getByRole('dialog').waitFor();
    },
  },
  {
    // Le profil, ouvert par le menu du compte (lot A5).
    name: 'profile',
    audience: 'personal',
    step: 'orders',
    enter: async (preview) => {
      // Les noms portent les marqueurs invisibles de l'aperçu : d'où les motifs.
      // Au bureau, le menu du compte ; en poche, le menu de la barre.
      const account = preview.getByRole('button', { name: /Mon compte personnel/ }).first();
      if (await account.isVisible()) {
        await account.click({ modifiers: ['Alt'] });
        await preview.getByRole('link', { name: /Mon profil/ }).first().click({ modifiers: ['Alt'] });
      } else {
        await preview.getByRole('button', { name: /Menu/ }).first().click({ modifiers: ['Alt'] });
        await preview.getByRole('button', { name: /Mon profil/ }).first().click({ modifiers: ['Alt'] });
      }
      await preview.waitForURL(/\/mon-profil/);
    },
  },
  {
    name: 'legal-terms',
    audience: 'visitor',
    step: 'welcome',
    enter: mention('Conditions générales de vente'),
    widths: FOOTER_WIDTHS,
  },
  {
    name: 'legal-accessibility',
    audience: 'visitor',
    step: 'welcome',
    enter: mention('Accessibilité'),
    widths: FOOTER_WIDTHS,
  },
];
