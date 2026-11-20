/**
 * Les segments des textes de la carte des sites (espace `siteMenu`, et ses
 * entrées de menu et titres de page — `documentation/comptes-client/carte-des-sites.md`).
 * Placé AVANT les autres dans le glossaire : un segment déjà connu ailleurs
 * garde son libellé.
 */
export const GLOSSARY_SITE_MENU: Readonly<Record<string, string>> = {
  siteMenuLink: 'Lien vers la carte des sites',
  commonMenu: 'Titre de page — la carte commune des sites',
  myMenu: 'Titre de page — ma carte',
  catalogueReadSubtitle: 'Carte — ce que veut dire ouvert ou fermé',
  commonTitle: 'Carte commune — titre',
  commonNone: 'Carte commune — pas encore posée',
  commonSet: 'Carte commune — posée',
  commonExplain: 'Carte commune — ce qu’elle fait',
  openCommon: 'Bouton — régler la carte commune',
  stateCommon: 'État d’un site — suit la carte commune',
  stateOwn: 'État d’un site — carte propre',
  stateNone: 'État d’un site — pas de carte',
  statesFailed: 'Échec de lecture de la carte de certains sites',
  makeOwn: 'Bouton — faire une carte propre',
  editOwn: 'Bouton — régler la carte du site',
  followCommon: 'Bouton — revenir à la carte commune',
  followed: 'Confirmation — le site suit la carte commune',
  lineCommon: 'Ligne d’un site — suit la carte commune',
  lineOwn: 'Ligne d’un site — carte propre',
  lineOwnMasks: 'Ligne d’un site — sa carte masque la commune',
  lineExempt: 'Ligne d’un site — exempté de la carte commune',
  lineNone: 'Ligne d’un site — pas de carte',
  commonPageTitle: 'Page de la carte commune — titre',
  commonPageLead: 'Page de la carte commune — chapeau',
  commonSaved: 'Confirmation — carte commune enregistrée',
  notPrincipalTitle: 'Pas de carte commune — titre',
  notPrincipalBody: 'Pas de carte commune — explication',
  myTitle: 'Ma carte — titre',
  myLead: 'Ma carte — chapeau',
  myFromCommon: 'Ma carte — vient de la carte commune',
  myOwn: 'Ma carte — propre au site',
  myReadOnly: 'Ma carte — réglée par le compte principal',
  myNoneTitle: 'Ma carte — absente, titre',
  myNoneBody: 'Ma carte — absente, explication',
  myUnavailableTitle: 'Ma carte — pas un site, titre',
  myUnavailableBody: 'Ma carte — pas un site, explication',
};
