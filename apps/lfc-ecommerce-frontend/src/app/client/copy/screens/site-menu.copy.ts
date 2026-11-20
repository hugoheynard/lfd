import type { LocaleCode } from '../../client-locale.service';

/**
 * **Ce que disent « Mes sites » et la carte d'un site** — l'écran où le
 * propriétaire ou l'administrateur d'un compte principal dit ce que chacun de
 * ses sites peut commander (`documentation/comptes-client/carte-des-sites.md`,
 * § 3.3, § 5).
 */
export interface SiteMenuCopy {
  readonly sitesTitle: string;
  readonly sitesLead: string;
  readonly sitesEmptyTitle: string;
  readonly sitesEmptyBody: string;
  /** Le bouton d'un site, vers sa carte. */
  readonly openMenu: string;

  readonly title: string;
  /** `{site}` = le nom du site. */
  readonly lead: string;
  readonly back: string;
  readonly loading: string;
  readonly loadFailedTitle: string;
  readonly loadFailedBody: string;
  readonly retry: string;
  readonly unknownSiteTitle: string;
  readonly unknownSiteBody: string;

  /** `{open}` et `{total}` : des nombres d'articles. */
  readonly summary: string;
  /** « Seulement » sans aucune entrée : permis, mais dit en clair (§ 3.3). */
  readonly closedAll: string;

  readonly settingsTitle: string;
  readonly modeLabel: string;
  readonly modeExcept: string;
  readonly modeOnly: string;
  readonly offMenuLabel: string;
  readonly offMenuHidden: string;
  readonly offMenuLocked: string;

  readonly copyLabel: string;
  readonly copyPlaceholder: string;
  /** `{site}` = le site dont la carte vient d'être reprise. */
  readonly copied: string;
  /** `{site}` = le site qui n'a pas de carte. */
  readonly copyEmpty: string;
  readonly copyFailed: string;

  readonly catalogueTitle: string;
  readonly catalogueSubtitle: string;
  readonly catalogueEmpty: string;
  /** La ligne qui règle la famille entière, en tête de ses articles. */
  readonly familyWhole: string;
  readonly inherit: string;
  readonly include: string;
  readonly exclude: string;
  /** L'état d'un article sous la carte, en clair. */
  readonly open: string;
  readonly closed: string;

  readonly staleTitle: string;
  readonly staleSubtitle: string;
  readonly staleRemove: string;
  readonly levelFamily: string;
  readonly levelProduct: string;
  readonly levelSku: string;

  readonly save: string;
  readonly saved: string;
}

export const SITE_MENU_FR: SiteMenuCopy = {
  sitesTitle: 'Mes sites',
  sitesLead: 'Les sites rattachés à votre compte, et ce que chacun peut commander.',
  sitesEmptyTitle: 'Aucun site',
  sitesEmptyBody: 'Aucun site n’est rattaché à ce compte.',
  openMenu: 'Régler la carte',

  title: 'Carte du site',
  lead: 'Ce que {site} peut commander.',
  back: 'Mes sites',
  loading: 'Chargement de la carte…',
  loadFailedTitle: 'La carte n’a pas pu être lue',
  loadFailedBody: 'Vérifiez votre connexion, puis réessayez.',
  retry: 'Réessayer',
  unknownSiteTitle: 'Site introuvable',
  unknownSiteBody:
    'Ce site n’est pas rattaché au compte où vous êtes, ou vous ne pouvez pas régler sa carte.',

  summary: '{open} articles ouverts sur {total}',
  closedAll: 'Aucune entrée en mode « Seulement » : ce site ne peut rien commander.',

  settingsTitle: 'Réglages',
  modeLabel: 'Ce que le site commande',
  modeExcept: 'Tout, sauf…',
  modeOnly: 'Seulement…',
  offMenuLabel: 'Un article hors de la carte',
  offMenuHidden: 'est masqué',
  offMenuLocked: 'reste visible, verrouillé',

  copyLabel: 'Copier la carte d’un autre site',
  copyPlaceholder: 'Choisir un site',
  copied: 'La carte de {site} est reprise : enregistrez pour l’appliquer.',
  copyEmpty: '{site} n’a pas de carte : il n’y a rien à copier.',
  copyFailed: 'La carte de ce site n’a pas pu être lue.',

  catalogueTitle: 'Le catalogue',
  catalogueSubtitle: 'Hérite : suit le réglage au-dessus. Inclus ou Exclu : l’emporte sur lui.',
  catalogueEmpty: 'Le catalogue est vide.',
  familyWhole: 'Toute la famille',
  inherit: 'Hérite',
  include: 'Inclus',
  exclude: 'Exclu',
  open: 'ouvert',
  closed: 'fermé',

  staleTitle: 'Plus au catalogue',
  staleSubtitle: 'Ces entrées ne désignent plus rien que votre catalogue montre : elles dorment.',
  staleRemove: 'Retirer',
  levelFamily: 'Famille',
  levelProduct: 'Produit',
  levelSku: 'Déclinaison',

  save: 'Enregistrer',
  saved: 'Carte enregistrée.',
};

export const SITE_MENU_EN: SiteMenuCopy = {
  sitesTitle: 'My sites',
  sitesLead: 'The sites attached to your account, and what each one may order.',
  sitesEmptyTitle: 'No site',
  sitesEmptyBody: 'No site is attached to this account.',
  openMenu: 'Set the menu',

  title: 'Site menu',
  lead: 'What {site} may order.',
  back: 'My sites',
  loading: 'Loading the menu…',
  loadFailedTitle: 'The menu could not be read',
  loadFailedBody: 'Check your connection, then try again.',
  retry: 'Try again',
  unknownSiteTitle: 'Site not found',
  unknownSiteBody:
    'This site is not attached to the account you are in, or you cannot set its menu.',

  summary: '{open} items open out of {total}',
  closedAll: 'No entry in “Only” mode: this site cannot order anything.',

  settingsTitle: 'Settings',
  modeLabel: 'What the site orders',
  modeExcept: 'Everything except…',
  modeOnly: 'Only…',
  offMenuLabel: 'An item off the menu',
  offMenuHidden: 'is hidden',
  offMenuLocked: 'stays visible, locked',

  copyLabel: 'Copy another site’s menu',
  copyPlaceholder: 'Choose a site',
  copied: 'The menu of {site} is copied: save to apply it.',
  copyEmpty: '{site} has no menu: there is nothing to copy.',
  copyFailed: 'The menu of this site could not be read.',

  catalogueTitle: 'The catalogue',
  catalogueSubtitle: 'Inherit: follows the setting above. Included or Excluded: overrides it.',
  catalogueEmpty: 'The catalogue is empty.',
  familyWhole: 'The whole family',
  inherit: 'Inherit',
  include: 'Included',
  exclude: 'Excluded',
  open: 'open',
  closed: 'closed',

  staleTitle: 'No longer in the catalogue',
  staleSubtitle:
    'These entries no longer point to anything your catalogue shows: they are dormant.',
  staleRemove: 'Remove',
  levelFamily: 'Family',
  levelProduct: 'Product',
  levelSku: 'Variant',

  save: 'Save',
  saved: 'Menu saved.',
};

export const SITE_MENU_IT: SiteMenuCopy = {
  sitesTitle: 'I miei siti',
  sitesLead: 'I siti collegati al tuo account, e ciò che ciascuno può ordinare.',
  sitesEmptyTitle: 'Nessun sito',
  sitesEmptyBody: 'Nessun sito è collegato a questo account.',
  openMenu: 'Imposta la carta',

  title: 'Carta del sito',
  lead: 'Ciò che {site} può ordinare.',
  back: 'I miei siti',
  loading: 'Caricamento della carta…',
  loadFailedTitle: 'Non è stato possibile leggere la carta',
  loadFailedBody: 'Controlla la connessione, poi riprova.',
  retry: 'Riprova',
  unknownSiteTitle: 'Sito non trovato',
  unknownSiteBody:
    'Questo sito non è collegato all’account in cui ti trovi, oppure non puoi impostarne la carta.',

  summary: '{open} articoli aperti su {total}',
  closedAll: 'Nessuna voce in modalità «Solo»: questo sito non può ordinare nulla.',

  settingsTitle: 'Impostazioni',
  modeLabel: 'Ciò che il sito ordina',
  modeExcept: 'Tutto, tranne…',
  modeOnly: 'Solo…',
  offMenuLabel: 'Un articolo fuori carta',
  offMenuHidden: 'è nascosto',
  offMenuLocked: 'resta visibile, bloccato',

  copyLabel: 'Copia la carta di un altro sito',
  copyPlaceholder: 'Scegli un sito',
  copied: 'La carta di {site} è ripresa: salva per applicarla.',
  copyEmpty: '{site} non ha una carta: non c’è nulla da copiare.',
  copyFailed: 'Non è stato possibile leggere la carta di questo sito.',

  catalogueTitle: 'Il catalogo',
  catalogueSubtitle: 'Eredita: segue l’impostazione sopra. Incluso o Escluso: la sostituisce.',
  catalogueEmpty: 'Il catalogo è vuoto.',
  familyWhole: 'Tutta la famiglia',
  inherit: 'Eredita',
  include: 'Incluso',
  exclude: 'Escluso',
  open: 'aperto',
  closed: 'chiuso',

  staleTitle: 'Non più nel catalogo',
  staleSubtitle: 'Queste voci non indicano più nulla che il tuo catalogo mostri: restano inattive.',
  staleRemove: 'Rimuovi',
  levelFamily: 'Famiglia',
  levelProduct: 'Prodotto',
  levelSku: 'Variante',

  save: 'Salva',
  saved: 'Carta salvata.',
};

const DICTIONARIES: Readonly<Record<LocaleCode, SiteMenuCopy>> = {
  fr: SITE_MENU_FR,
  en: SITE_MENU_EN,
  it: SITE_MENU_IT,
};

/** Le dictionnaire de la langue choisie. */
export function siteMenuCopy(locale: LocaleCode): SiteMenuCopy {
  return DICTIONARIES[locale];
}
