/**
 * **Le nom de l'écran**, tiré du titre de sa route.
 *
 * Les routes déclarent un titre de DOCUMENT — « File de remise — LFC B2B
 * admin » — parce que c'est ce qu'un onglet de navigateur doit porter : le nom
 * de l'écran ET celui de l'application, dans cet ordre, pour qu'une rangée
 * d'onglets reste lisible. La barre de l'app, elle, dit déjà de quelle
 * application il s'agit : y répéter le suffixe écrirait deux fois la même
 * chose sur la même ligne.
 *
 * 🔴 Le suffixe est reconnu par le TIRET CADRATIN, pas par le texte qui le
 * suit. Chercher « LFC B2B admin » ferait dépendre cette fonction d'un nom
 * commercial — et le jour où l'application est renommée, chaque titre
 * garderait son ancien suffixe collé au nom de l'écran, sans que rien ne
 * rougisse.
 */
const TITLE_SEPARATOR = '—';

/** Le nom de l'écran, ou `null` quand la route n'annonce pas de titre. */
export function pageNameOf(title: string | undefined): string | null {
  if (title === undefined) {
    return null;
  }
  const name = title.split(TITLE_SEPARATOR)[0]?.trim() ?? '';
  return name === '' ? null : name;
}

/**
 * **Ce que la barre de l'app écrit après la marque** — l'espace de travail
 * ouvert, à défaut le nom de l'écran.
 *
 * Dans un espace de travail, le nom de la VUE est déjà écrit deux fois : en
 * tête du rail secondaire et dans le bandeau de la page. Le répéter une
 * troisième fois en haut à gauche laissait « LFC PRO / Tableau de bord » sans
 * jamais dire qu'on était dans le Commercial — alors que c'est précisément ce
 * que le fil d'en-tête doit porter : le général, puis le particulier.
 *
 * Hors espace (une page de premier niveau, comme la file de remise), il n'y a
 * pas de général : l'écran EST le niveau, et c'est son nom qui s'affiche.
 */
export function headerNameOf(workspace: string | undefined, page: string | null): string | null {
  return workspace ?? page;
}
