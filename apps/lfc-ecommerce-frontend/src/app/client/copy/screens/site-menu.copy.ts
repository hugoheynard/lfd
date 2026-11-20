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

  /** La carte lue sans réglage (« Ma carte », la carte commune vue d'un site). */
  readonly catalogueReadSubtitle: string;

  /** « Mes sites » : la carte commune, en tête (§ 6). */
  readonly commonTitle: string;
  readonly commonNone: string;
  /** `{entries}` = le nombre d'entrées de la carte commune. */
  readonly commonSet: string;
  readonly commonExplain: string;
  readonly openCommon: string;
  /** L'état de la carte d'un site, sur sa ligne. */
  readonly stateCommon: string;
  readonly stateOwn: string;
  readonly stateNone: string;
  readonly statesFailed: string;
  readonly makeOwn: string;
  readonly editOwn: string;
  readonly followCommon: string;
  readonly followed: string;

  /** La carte d'un site : ce qui compte pour lui. */
  readonly lineCommon: string;
  readonly lineOwn: string;
  readonly lineOwnMasks: string;
  readonly lineExempt: string;
  readonly lineNone: string;

  /** La page de la carte commune. */
  readonly commonPageTitle: string;
  readonly commonPageLead: string;
  readonly commonSaved: string;
  readonly notPrincipalTitle: string;
  readonly notPrincipalBody: string;

  /** « Ma carte », lue par les membres du site. */
  readonly myTitle: string;
  readonly myLead: string;
  readonly myFromCommon: string;
  readonly myOwn: string;
  readonly myReadOnly: string;
  readonly myNoneTitle: string;
  readonly myNoneBody: string;
  readonly myUnavailableTitle: string;
  readonly myUnavailableBody: string;
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

  catalogueReadSubtitle: 'Ouvert : le site peut le commander. Fermé : il est hors de la carte.',

  commonTitle: 'Carte commune des sites',
  commonNone:
    'Aucune carte commune : les sites sans carte propre commandent tout ce que la boutique leur sert.',
  commonSet:
    'Une carte commune est posée ({entries} entrées) : elle vaut pour chaque site sans carte propre.',
  commonExplain:
    'Une carte propre posée sur un site masque la carte commune. Pour exempter un site, faites-lui une carte propre « Tout, sauf… » sans exclusion.',
  openCommon: 'Régler la carte commune',
  stateCommon: 'Carte commune',
  stateOwn: 'Carte propre',
  stateNone: 'Pas de carte',
  statesFailed: 'La carte de certains sites n’a pas pu être lue.',
  makeOwn: 'Faire une carte propre',
  editOwn: 'Régler sa carte',
  followCommon: 'Revenir à la carte commune',
  followed: 'Le site suit de nouveau la carte commune.',

  lineCommon:
    'Ce site suit la carte commune. Enregistrer ici lui fait une carte propre, qui remplace la commune.',
  lineOwn: 'Ce site a sa carte propre.',
  lineOwnMasks: 'Ce site a sa carte propre : elle masque la carte commune.',
  lineExempt: 'Elle ne restreint rien : ce site est exempté de la carte commune.',
  lineNone: 'Ce site n’a pas de carte : il commande tout ce que la boutique lui sert.',

  commonPageTitle: 'Carte commune des sites',
  commonPageLead: 'Ce que vos sites commandent, sauf ceux qui ont leur carte propre.',
  commonSaved: 'Carte commune enregistrée.',
  notPrincipalTitle: 'Pas de carte commune ici',
  notPrincipalBody: 'Vous ne réglez pas la carte des sites de ce compte, ou il n’a pas de sites.',

  myTitle: 'Ma carte',
  myLead: 'Ce que votre site peut commander.',
  myFromCommon: 'Cette carte est la carte commune des sites de votre compte principal.',
  myOwn: 'Cette carte est propre à votre site.',
  myReadOnly: 'Seul votre compte principal règle cette carte.',
  myNoneTitle: 'Pas de carte',
  myNoneBody: 'Votre site commande tout ce que la boutique lui sert.',
  myUnavailableTitle: 'Pas de carte à lire ici',
  myUnavailableBody: 'Cet espace n’est pas un site rattaché à un compte principal.',
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

  catalogueReadSubtitle: 'Open: the site may order it. Closed: it is off the menu.',

  commonTitle: 'Shared site menu',
  commonNone:
    'No shared menu: sites without their own menu may order everything the shop serves them.',
  commonSet:
    'A shared menu is set ({entries} entries): it applies to every site without its own menu.',
  commonExplain:
    'A site’s own menu hides the shared menu. To exempt a site, give it its own “Everything except…” menu with no exclusion.',
  openCommon: 'Set the shared menu',
  stateCommon: 'Shared menu',
  stateOwn: 'Own menu',
  stateNone: 'No menu',
  statesFailed: 'The menu of some sites could not be read.',
  makeOwn: 'Give it its own menu',
  editOwn: 'Set its menu',
  followCommon: 'Back to the shared menu',
  followed: 'The site follows the shared menu again.',

  lineCommon:
    'This site follows the shared menu. Saving here gives it its own menu, which replaces the shared one.',
  lineOwn: 'This site has its own menu.',
  lineOwnMasks: 'This site has its own menu: it hides the shared menu.',
  lineExempt: 'It restricts nothing: this site is exempt from the shared menu.',
  lineNone: 'This site has no menu: it may order everything the shop serves it.',

  commonPageTitle: 'Shared site menu',
  commonPageLead: 'What your sites may order, except those with their own menu.',
  commonSaved: 'Shared menu saved.',
  notPrincipalTitle: 'No shared menu here',
  notPrincipalBody: 'You do not set the menu of this account’s sites, or it has no sites.',

  myTitle: 'My menu',
  myLead: 'What your site may order.',
  myFromCommon: 'This menu is the shared menu of your main account’s sites.',
  myOwn: 'This menu is your site’s own.',
  myReadOnly: 'Only your main account sets this menu.',
  myNoneTitle: 'No menu',
  myNoneBody: 'Your site may order everything the shop serves it.',
  myUnavailableTitle: 'No menu to read here',
  myUnavailableBody: 'This space is not a site attached to a main account.',
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

  catalogueReadSubtitle: 'Aperto: il sito può ordinarlo. Chiuso: è fuori carta.',

  commonTitle: 'Carta comune dei siti',
  commonNone:
    'Nessuna carta comune: i siti senza carta propria possono ordinare tutto ciò che il negozio offre loro.',
  commonSet:
    'È impostata una carta comune ({entries} voci): vale per ogni sito senza carta propria.',
  commonExplain:
    'La carta propria di un sito nasconde la carta comune. Per esentare un sito, dagli una carta propria «Tutto, tranne…» senza esclusioni.',
  openCommon: 'Imposta la carta comune',
  stateCommon: 'Carta comune',
  stateOwn: 'Carta propria',
  stateNone: 'Nessuna carta',
  statesFailed: 'Non è stato possibile leggere la carta di alcuni siti.',
  makeOwn: 'Crea una carta propria',
  editOwn: 'Imposta la sua carta',
  followCommon: 'Torna alla carta comune',
  followed: 'Il sito segue di nuovo la carta comune.',

  lineCommon:
    'Questo sito segue la carta comune. Salvare qui gli dà una carta propria, che sostituisce quella comune.',
  lineOwn: 'Questo sito ha una carta propria.',
  lineOwnMasks: 'Questo sito ha una carta propria: nasconde la carta comune.',
  lineExempt: 'Non limita nulla: questo sito è esentato dalla carta comune.',
  lineNone: 'Questo sito non ha una carta: può ordinare tutto ciò che il negozio gli offre.',

  commonPageTitle: 'Carta comune dei siti',
  commonPageLead: 'Ciò che i tuoi siti ordinano, tranne quelli con una carta propria.',
  commonSaved: 'Carta comune salvata.',
  notPrincipalTitle: 'Nessuna carta comune qui',
  notPrincipalBody: 'Non imposti la carta dei siti di questo account, oppure non ha siti.',

  myTitle: 'La mia carta',
  myLead: 'Ciò che il tuo sito può ordinare.',
  myFromCommon: 'Questa carta è la carta comune dei siti del tuo account principale.',
  myOwn: 'Questa carta è propria del tuo sito.',
  myReadOnly: 'Solo il tuo account principale imposta questa carta.',
  myNoneTitle: 'Nessuna carta',
  myNoneBody: 'Il tuo sito può ordinare tutto ciò che il negozio gli offre.',
  myUnavailableTitle: 'Nessuna carta da leggere qui',
  myUnavailableBody: 'Questo spazio non è un sito collegato a un account principale.',
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
