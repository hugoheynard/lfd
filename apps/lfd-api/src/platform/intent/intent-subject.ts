import { createHash } from "node:crypto";

/**
 * **Le sujet d'une intention** : ce que le geste vise, et l'empreinte de ce
 * qu'il en dit. La même clé renvoyée sur un AUTRE contenu (un formulaire
 * corrigé après un succès) est alors refusée (409, `IntentKeyReusedError`),
 * jamais rendue comme le résultat d'avant.
 *
 * L'empreinte est un condensat : le registre ne range ni le texte saisi, ni
 * une adresse, ni les octets d'une photo — seulement de quoi les reconnaître.
 * Un sujet tient dans la colonne (`gesture_intent.subject`, 300) : la cible
 * est un identifiant opaque, l'empreinte 64 caractères.
 */
export function intentSubject(target: string, ...content: readonly unknown[]): string {
  return `${target}|${fingerprintOf(content)}`;
}

function fingerprintOf(content: readonly unknown[]): string {
  const hash = createHash("sha256");
  for (const part of content) {
    if (part instanceof Uint8Array) {
      hash.update(part);
    } else {
      hash.update(JSON.stringify(part ?? null));
    }
    // Un séparateur : `["ab", "c"]` et `["a", "bc"]` ne se confondent pas.
    hash.update("\u0000");
  }
  return hash.digest("hex");
}
