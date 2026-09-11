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
