import { createHash } from "node:crypto";

import {
  MediaStore,
  type PublicAsset,
  type StoredAsset,
} from "../src/platform/storage/media-store.js";

/**
 * Le **magasin d'octets des e2e** — en mémoire, jamais R2.
 *
 * 🔴 C'est la SECONDE frontière doublée du harnais, après la signature Auth0, et
 * elle se justifie pareillement : R2 est un tiers distant à jetons, et ce n'est
 * pas ce qu'un e2e éprouve. Tout le reste du dépôt — la validation des octets,
 * la mesure des dimensions, l'inscription en base, le fait journalisé — passe
 * par le vrai chemin.
 *
 * 🔴 **L'adressage par contenu est REPRODUIT, pas simulé** : la clé est le
 * SHA-256 des octets, comme en production. C'est ce qui fait que redéposer le
 * même fichier retombe sur la même URL — la propriété sur laquelle reposent la
 * reprise d'un lot de dépôt, la réparation d'une suppression, et l'unicité de
 * l'entrée de bibliothèque. Un double qui rendrait une clé aléatoire laisserait
 * tout cela intestable.
 */
export class InMemoryMediaStore extends MediaStore {
  private readonly objects = new Map<string, Buffer>();

  put(prefix: string, asset: PublicAsset): Promise<StoredAsset> {
    const digest = createHash("sha256").update(asset.bytes).digest("hex");
    const storageKey = `${prefix}/${digest}.${extensionOf(asset.contentType)}`;
    this.objects.set(storageKey, asset.bytes);
    return Promise.resolve({ storageKey, url: `https://media.test/${storageKey}` });
  }

  remove(storageKey: string): Promise<void> {
    this.objects.delete(storageKey);
    return Promise.resolve();
  }

  /** Ce que le bucket contient — pour éprouver le ramassage des orphelins. */
  keys(): readonly string[] {
    return [...this.objects.keys()];
  }
}

function extensionOf(contentType: string): string {
  return contentType === "image/jpeg" ? "jpg" : contentType.replace("image/", "");
}
