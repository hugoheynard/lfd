/**
 * Le nom de fichier qu'un en-tête `Content-Disposition` propose, ou `null`.
 *
 * ## Pourquoi le lire plutôt que le recalculer
 *
 * Le serveur nomme ses fichiers d'après ce qu'ils contiennent — le cycle, le
 * schéma, l'avertissement `BROUILLON-`. Le reconstruire ici ferait une seconde
 * définition de ce nom, et c'est celle que l'utilisateur lit sur son bureau
 * qui dériverait (objection 9 de `plan-mandat-deux-schemas.md`).
 *
 * `filename*` (RFC 6266, encodé en RFC 5987) l'emporte sur `filename` quand les
 * deux sont là : c'est la forme qui porte les accents.
 *
 * ⚠️ Un en-tête que le navigateur ne laisse pas lire rend `null` comme un
 * en-tête absent : en origine croisée, `Content-Disposition` n'est visible que
 * si le serveur l'expose (`Access-Control-Expose-Headers`). D'où le nom de repli
 * que chaque appelant fournit.
 */
export function attachmentFileName(header: string | null): string | null {
  if (header === null) {
    return null;
  }
  const extended = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/iu.exec(header);
  if (extended?.[2] !== undefined) {
    const decoded = decode(extended[2].trim());
    if (decoded !== null && decoded !== '') {
      return decoded;
    }
  }
  const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/iu.exec(header);
  const name = (plain?.[1] ?? plain?.[2] ?? '').trim();
  return name === '' ? null : name;
}

/** Un `%` mal formé ne doit pas faire échouer le téléchargement : on retombe sur `filename`. */
function decode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
