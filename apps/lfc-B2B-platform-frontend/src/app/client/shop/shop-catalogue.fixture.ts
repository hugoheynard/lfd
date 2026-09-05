import type { ShopCatalogueView, ShopItemView } from '@lfd/contracts';

import type { ShopCatalogue } from './shop-catalogue.store';

/**
 * **Un catalogue de TEST**, et rien d'autre.
 *
 * ⚠️ Il ne se substitue à aucune donnée de production : l'application entière
 * lit `ShopCatalogue`, hydraté depuis `GET /shop/catalogue`. Ce fichier n'est
 * importé que par des specs — aucun composant, aucun service.
 *
 * Il remplace le catalogue de maquette qui SERVAIT l'application, et la nuance
 * est tout le chantier : celui-là faisait autorité sur des prix qu'un client
 * voyait, celui-ci ne sort jamais d'une suite de tests.
 *
 * Les prix sont en **millicentimes HORS TAXE**, comme le serveur les rend.
 * `140_000` = 1,40 € HT ; à 5,5 %, la vitrine affiche 1,48 € TTC.
 */

/** Les rayons du référentiel, tels que la vitrine les reçoit. */
export const TEST_SHELVES = [
  { id: 'cat_vien', name: 'Viennoiseries', position: 0 },
  { id: 'cat_pains', name: 'Pains', position: 1 },
  { id: 'cat_patis', name: 'Pâtisseries', position: 2 },
  { id: 'cat_sale', name: 'Salé & traiteur', position: 3 },
  { id: 'cat_choco', name: 'Chocolat', position: 4 },
] as const;

function item(over: Partial<ShopItemView> & Pick<ShopItemView, 'sku' | 'name'>): ShopItemView {
  return {
    note: null,
    image: null,
    unitPriceMillicents: 140_000,
    vatRatePercent: 5.5,
    shelfId: 'cat_vien',
    isFeatured: false,
    ...over,
  };
}

export const TEST_ITEMS: readonly ShopItemView[] = [
  item({ sku: 'VIE-001', name: 'Croissant au beurre', note: 'Tourage patient' }),
  item({ sku: 'VIE-002', name: 'Pain au chocolat', unitPriceMillicents: 160_000 }),
  item({
    sku: 'PAI-001',
    name: 'Pain de campagne',
    shelfId: 'cat_pains',
    unitPriceMillicents: 480_000,
  }),
  item({
    sku: 'PAI-002',
    name: 'Baguette de tradition',
    shelfId: 'cat_pains',
    unitPriceMillicents: 130_000,
  }),
  item({
    sku: 'PAT-001',
    name: 'Éclair',
    shelfId: 'cat_patis',
    unitPriceMillicents: 350_000,
    isFeatured: true,
  }),
  // Le salé porte l'AUTRE taux : c'est lui qui fait exister deux lignes de TVA.
  item({
    sku: 'SAL-001',
    name: 'Quiche du jour',
    shelfId: 'cat_sale',
    unitPriceMillicents: 450_000,
    vatRatePercent: 10,
  }),
  item({
    sku: 'CHO-001',
    name: 'Tablette 70 %',
    shelfId: 'cat_choco',
    unitPriceMillicents: 590_000,
  }),
];

export const TEST_CATALOGUE: ShopCatalogueView = {
  shelves: [...TEST_SHELVES],
  items: TEST_ITEMS,
};

/**
 * Pose le catalogue comme le réseau le poserait.
 *
 * Elle écrit dans l'état privé du dépôt plutôt que d'en fabriquer un double :
 * un doublé peut dériver du dépôt réel sans que rien ne rougisse, alors qu'une
 * pose passe par le VRAI code — le même `items()`, le même `itemOf()`, le même
 * `status()` que l'application lit.
 */
export function hydrateWith(catalogue: ShopCatalogue, view: ShopCatalogueView): void {
  catalogue.receive(view);
}
