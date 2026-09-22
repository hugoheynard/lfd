/**
 * **Les écrans de SOCIÉTÉ sont-ils fermés ?** — la règle, écrite une fois.
 *
 * Mon compte (le dossier), Mes factures (le relevé) et les paniers récurrents
 * n'existent que pour une maison. Deux surfaces décident de leur sort, et elles
 * doivent dire la même chose : le **menu** les retire, la **garde** ferme
 * l'adresse tapée ou gardée en favori.
 *
 * 🔴 **Elles portaient chacune leur copie, et les deux avaient le même trou**
 * (Hugo, 2026-09-22 : « mon compte n'a pas d'entreprise et avait quand même
 * accès à mon compte »). Toutes deux disaient « qui a une société et a basculé
 * en perso » — ce qui laisse **grand ouvert** le cas de qui n'en a aucune.
 *
 * ## Pourquoi une FONCTION, et pas un `computed` sur un service
 *
 * Elle a d'abord été posée sur `ClientWorkspace`. Sept fichiers de test s'y
 * sont cassés d'un coup — `reglement-page`, `client-addresses`… — parce qu'ils
 * doublent ce service et que leurs doubles n'avaient pas le nouveau membre. Une
 * règle de navigation qui fait tomber l'écran de règlement est une règle rangée
 * au mauvais endroit : le service central est doublé partout, et tout ce qu'on
 * lui ajoute devient une dette pour chaque double.
 *
 * Une fonction pure ne se double pas. Chaque appelant lit ses propres signaux —
 * ce qui n'est PAS une duplication de la règle, seulement de ses entrées — et
 * la décision, elle, n'a qu'un seul texte.
 */
export interface CompanyScreensState {
  /** L'espace courant est le perso. */
  readonly isPersonal: boolean;
  /** La personne a au moins une société. */
  readonly hasChoice: boolean;
  /** `/me` a répondu, et elle n'en a aucune. */
  readonly hasNoCompany: boolean;
  /** Une déclaration pro est en vol, en attente d'envoi, ou refusée. */
  readonly declarationUnderway: boolean;
}

/**
 * Deux raisons de fermer, et elles n'ont rien à voir l'une avec l'autre :
 *
 * 1. **on a une société, mais on est en perso** — ces écrans n'ont alors aucune
 *    maison à montrer ;
 * 2. **on n'a aucune société** — il n'y a rien à y voir du tout. C'était ouvert
 *    parce que la porte pro y vivait ; elle vit désormais sur `/mon-profil`,
 *    avec son lien d'ouverture et la liste des comptes.
 *
 * ⚠️ **La réserve** : une déclaration pro en vol ou en échec rouvre, parce que
 * la carte « Compléter mon dossier » est le SEUL rattrapage d'un envoi raté.
 * Sans elle, quelqu'un qui s'inscrit par la porte pro et dont la déclaration
 * échoue se retrouve dehors, avec un dossier commencé et nulle part où le
 * reprendre.
 *
 * ⚠️ `hasNoCompany` n'est vrai qu'une fois `/me` **lu** : la fermeture ne se
 * déclenche donc jamais pendant le chargement, quand on ne sait pas encore.
 */
export function companyScreensClosed(state: CompanyScreensState): boolean {
  if (state.isPersonal && state.hasChoice) {
    return true;
  }
  return state.hasNoCompany && !state.declarationUnderway;
}
