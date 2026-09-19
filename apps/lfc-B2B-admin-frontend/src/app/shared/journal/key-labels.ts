import type { JournalFactType } from '@lfd/contracts/journal-facts';

/**
 * **Le nom français de chaque clé de charge** — ce que le détail sous une
 * phrase affiche à gauche de la valeur (D4 du plan
 * `documentation/journalisation/plan-phrases-du-journal.md`).
 *
 * Une table par NOM de clé, et non par type : `priceMillicents` se dit « Prix
 * HT » partout où il paraît. Les clés que plusieurs faits emploient dans deux
 * sens (`name`, `label`, `from`) portent le mot le plus général qui reste vrai
 * pour tous.
 *
 * 🔴 Tenue par le test de clôture (`__tests__/closure.spec.ts`) : une clé du
 * catalogue qu'une phrase ne dit pas et qui manque ici fait échouer la CI. Une
 * clé ajoutée au catalogue se nomme donc ici dans le même geste — sans quoi le
 * détail l'afficherait sous son nom technique.
 *
 * Les clés d'un `record` (un contexte de vente, une option de déclinaison)
 * sont des DONNÉES, pas des champs : elles s'affichent telles quelles et n'ont
 * rien à faire ici.
 */
export const KEY_LABELS: Readonly<Record<string, string>> = {
  absorbed: 'Commandes absorbées',
  action: 'Action',
  activatedAt: 'Activé le',
  active: 'Actif',
  added: 'Ajoutés',
  address: 'Adresse',
  addressId: 'Adresse',
  after: 'Après',
  aligned: 'Aligné sur le défaut',
  allergens: 'Allergènes',
  alt: 'Texte alternatif',
  appellation: 'Appellation',
  appellationId: 'Appellation',
  appointmentId: 'Rendez-vous',
  articles: 'Articles',
  aspect: 'Section',
  at: 'Le',
  audience: 'Client visé',
  b2b: 'Professionnels',
  b2c: 'Particuliers',
  backfilled: 'Reprise après coup',
  bankAccountId: 'RIB',
  baseUrl: 'Adresse du site',
  before: 'Avant',
  blast: 'Portée',
  bp: 'Taux',
  brand: 'Marque',
  businessName: 'Enseigne',
  candidates: 'Articles candidats',
  carbsG: 'Glucides',
  category: 'Catégorie',
  categoryId: 'Famille',
  cause: 'Cause',
  cents: 'Montant',
  changed: 'Modifiés',
  changes: 'Modifications',
  channel: 'Canal',
  channels: 'Canaux de vente',
  clientLegalName: 'Raison sociale du client',
  clientName: 'Nom du client',
  closureCount: 'Fermetures datées',
  code: 'Code',
  codePostal: 'Code postal',
  company: 'Client',
  companyId: 'Client',
  configured: 'Configuré',
  contact: 'Contact',
  contactId: 'Contact',
  context: 'Contexte de vente',
  contexts: 'Contextes de vente',
  contractNumber: 'Numéro de contrat',
  date: 'Jour',
  days: 'Jours',
  daysBefore: 'Jours avant',
  debtorReference: 'Référence du débiteur',
  declared: 'Fiche réglementaire',
  deliveryAddress: 'Adresse de livraison',
  deliveryAddressId: 'Adresse de livraison',
  deliveryId: 'Arrivée du référentiel',
  description: 'Description',
  descriptionLong: 'Description longue',
  descriptionShort: 'Description courte',
  discount: 'Réduction',
  discountAudiences: 'Clientèles de la réduction',
  effect: 'Effet',
  email: 'Adresse e-mail',
  en: 'Anglais',
  endDate: 'Fin',
  energyKcal: 'Énergie',
  excluded: 'Articles écartés',
  excludedSkus: 'Articles écartés',
  exemptionId: 'Dérogation',
  families: 'Familles',
  // La portée d'un changement de taux du 2026-08-21 au 2026-08-24 (`blastByNamedContexts`).
  familiesB2b: 'Familles B2B',
  familiesEmporter: 'Familles à emporter',
  familiesSurPlace: 'Familles sur place',
  fatG: 'Matières grasses',
  fee: 'Frais',
  field: 'Champ',
  fields: 'Champs modifiés',
  fileName: 'Fichier',
  firstName: 'Prénom',
  formeJuridique: 'Forme juridique',
  fr: 'Français',
  from: 'Avant',
  fromLabel: 'Rôle d’avant',
  fulfillmentDate: 'Jour de retrait ou de livraison',
  fulfillmentMethod: 'Mode de retrait ou de livraison',
  glycemicIndex: 'Index glycémique',
  graceMinutes: 'Tolérance',
  grants: 'Droits',
  // Un RETRAIT, au comptoir ou chez le client : « remise » ne désigne que la
  // réduction de prix (CLAUDE.md racine, §8, décidé le 2026-09-12).
  handedOverAt: 'Retirée le',
  handedOverBy: 'Retrait validé par',
  handleSuffix: 'Suffixe de collection',
  hash: 'Empreinte',
  holder: 'Titulaire',
  ics: 'Identifiant créancier (ICS)',
  id: 'Identifiant',
  ingredients: 'Ingrédients',
  it: 'Italien',
  key: 'Clé',
  kind: 'Sorte',
  label: 'Libellé',
  last4: 'Fin du numéro',
  lastName: 'Nom',
  lines: 'Lignes',
  linkedUserId: 'Personne rapprochée',
  mayContain: 'Traces possibles',
  media: 'Visuels',
  method: 'Mode',
  mode: 'Mode',
  name: 'Nom',
  note: 'Note',
  noteId: 'Note',
  openToB2b: 'Ouverte aux professionnels',
  openToB2c: 'Ouverte aux particuliers',
  options: 'Options',
  order: 'Ordre',
  orderId: 'Commande',
  orderNumber: 'Numéro de commande',
  origin: 'Origine',
  owner: 'Détenteur',
  ownerUserId: 'Détenteur',
  pairing: 'Accord',
  parent: 'Famille parente',
  parentId: 'Famille parente',
  percent: 'Taux',
  person: 'Personne',
  pickupAddress: 'Point de retrait',
  pickupAddressId: 'Point de retrait',
  play: 'Coup recommandé',
  plural: 'Pluriel',
  pointOfSale: 'Point de vente',
  pointOfSaleId: 'Point de vente',
  position: 'Rang',
  postalPrefixCount: 'Préfixes postaux',
  postalPrefixes: 'Préfixes postaux',
  previous: 'Avant',
  previousLabel: 'Libellé d’avant',
  previousStatus: 'Statut d’avant',
  previousValue: 'Valeur d’avant',
  priceCents: 'Prix TTC',
  priceMillicents: 'Prix HT',
  promisedQuantity: 'Quantité promise',
  proteinG: 'Protéines',
  providerId: 'Identifiant d’envoi',
  quantity: 'Quantité',
  raisonSociale: 'Raison sociale',
  readyAt: 'Prête le',
  readyBy: 'Préparée par',
  reason: 'Motif',
  recurrence: 'Récurrence',
  reference: 'Référence',
  removed: 'Retirés',
  replacedMandate: 'Mandat remplacé',
  replacedMandateId: 'Mandat remplacé',
  resource: 'Clé de la ressource',
  resourceLabel: 'Ressource',
  revisionId: 'Révision',
  role: 'Rôle',
  roleLabel: 'Rôle',
  ruleCount: 'Plages',
  saltG: 'Sel',
  saturatedFatG: 'Acides gras saturés',
  scheme: 'Régime',
  scope: 'Portée',
  scopeId: 'Cible de la portée',
  score: 'Score',
  seoDescription: 'Description pour les moteurs de recherche',
  seoTitle: 'Titre pour les moteurs de recherche',
  serviceDay: 'Journée de service',
  shopifyProjected: 'Publié sur Shopify',
  signatureRequired: 'Signature exigée',
  signedAt: 'Signé le',
  singular: 'Singulier',
  siren: 'SIREN',
  siret: 'SIRET',
  skipped: 'Sautée',
  sku: 'SKU',
  source: 'Source de la reprise',
  startAt: 'Début',
  startDate: 'Début',
  status: 'Statut',
  step: 'Étape',
  story: 'Histoire',
  subjectLabel: 'Sujet',
  subscriptionId: 'Panier récurrent',
  sugarsG: 'Sucres',
  summary: 'Ce que disait la décision',
  supportRequestId: 'Demande de contact',
  suspended: 'Compte suspendu',
  table: 'Table',
  tableCount: 'Tables',
  terms: 'Conditions de règlement',
  time: 'Heure',
  to: 'Après',
  toLabel: 'Nouveau rôle',
  totalCents: 'Total',
  unitsPerContainer: 'Unités par contenant',
  url: 'Image',
  userId: 'Personne',
  validFrom: 'Valable du',
  validTo: 'Valable jusqu’au',
  value: 'Valeur',
  variant: 'Déclinaison',
  variantId: 'Déclinaison',
  variants: 'Déclinaisons',
  vatByContext: 'Taux de TVA par contexte de vente',
  vatRatePercent: 'Taux de TVA',
  versionId: 'Version',
  via: 'Par',
  ville: 'Ville',
  weekday: 'Jour de la semaine',
  weightGrams: 'Poids',
};

/**
 * **Les exceptions par type** : là où le mot commun serait faux. Une clé
 * s'appelle d'un seul nom dans tout le catalogue, sauf quand un type l'emploie
 * dans un autre sens — `categoryId` désigne une FAMILLE de fiches partout,
 * mais une catégorie d'allergènes sur la forme d'avant le lot B de
 * `allergen_entry.updated`.
 *
 * Une surcharge, pas une copie : un type n'y porte que les clés qu'il dit
 * autrement. Tenue par le test de clôture comme le dictionnaire commun.
 */
export const KEY_LABELS_BY_TYPE: Readonly<
  Partial<Record<JournalFactType, Readonly<Record<string, string>>>>
> = {
  'allergen_entry.updated': { categoryId: 'Catégorie' },
};

/**
 * Le libellé d'une clé — celui de son type d'abord, s'il en a un, puis le
 * commun —, ou `null` : c'est au détail de décider quoi faire d'une clé sans nom.
 */
export function keyLabel(key: string, type: string | null = null): string | null {
  // Import de TYPE seulement : le catalogue (et zod) n'a rien à faire ici.
  const byType: Readonly<Record<string, Readonly<Record<string, string>> | undefined>> =
    KEY_LABELS_BY_TYPE;
  const own = type !== null && Object.hasOwn(byType, type) ? byType[type] : undefined;
  if (own !== undefined && Object.hasOwn(own, key)) {
    return own[key] ?? null;
  }
  return Object.hasOwn(KEY_LABELS, key) ? (KEY_LABELS[key] ?? null) : null;
}
