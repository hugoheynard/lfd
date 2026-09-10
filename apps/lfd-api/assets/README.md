# Les images de marque

Deux fichiers, et le second se déduit du premier.

| Fichier                                  | Ce que c'est                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| `logo-la-folie-coffee.jpg`               | **L'original**, extrait de `Procedures_ouverture de compte Folie_Coffee.odt`    |
| `logo-la-folie-coffee-noir-et-blanc.png` | La version imprimable : niveaux de gris durcis, recadrée sur le rond, 220 × 220 |

## 🔴 Ce dossier n'est PAS lu à l'exécution

`nest build` a `deleteOutDir` et ne déclare aucun `assets` : un fichier posé ici
ne serait **pas copié dans `dist/`**. Il marcherait en test, où jest lit les
sources, et manquerait en production — la pire des pannes, celle qui ne se
reproduit pas sur la machine où on la cherche.

Le logo qui s'imprime sur les documents est donc **embarqué en base64** dans
[`../src/platform/shared/documents/brand-logo.ts`](../src/platform/shared/documents/brand-logo.ts).
Ce dossier garde les images pour les humains : les rouvrir, les retoucher, les
redonner à un imprimeur.

## Refaire la constante après une retouche

```bash
base64 -i assets/logo-la-folie-coffee-noir-et-blanc.png | tr -d '\n'
```

Le résultat remplace la chaîne de `brand-logo.ts`. Rien d'autre à faire : aucune
configuration de build ne dépend de ce dossier, et c'est précisément le but.
