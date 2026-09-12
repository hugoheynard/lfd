# Les images de marque

Deux fichiers, et le second se déduit du premier.

| Fichier                                  | Ce que c'est                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `logo-la-folie-coffee.jpg`               | **L'original**, extrait de `Procedures_ouverture de compte Folie_Coffee.odt`                      |
| `logo-la-folie-coffee-noir-et-blanc.png` | La version imprimable : niveaux durcis, recadrée sur le rond, **256 × 256** — c'est elle qui sert |

## 🔴 Ce dossier n'est PAS lu à l'exécution

`nest build` a `deleteOutDir` et ne déclare aucun `assets` ; `tsconfig.seed.json`
ne copie rien non plus. Un fichier posé ici ne serait **pas copié dans `dist/`**.
Il marcherait en test, où jest lit les sources, et manquerait en production — la
pire des pannes, celle qui ne se reproduit pas sur la machine où on la cherche.

Le logo semé sur un poste de développement est donc **embarqué en base64** dans
[`../src/dev/seeding/brand-logo.ts`](../src/dev/seeding/brand-logo.ts). Ce
dossier garde les images pour les humains : les rouvrir, les retoucher, les
redonner à un imprimeur.

## ⚠️ La définition, et une erreur à ne pas refaire

`EntityLogo` refuse un logo de moins de **256 px de côté** : en dessous, il est
flou à l'impression du mandat, et c'est à l'impression qu'on s'en aperçoit —
c'est-à-dire sur un document déjà parti chez un client.

Le rond découpé dans l'original fait **247 × 249 px**. Il est donc
**rééchantillonné** à 256, ce qui est un agrandissement de 2,8 % : imperceptible.

Une version de ce fichier a **complété de blanc** jusqu'à 256 au lieu de
rééchantillonner. C'était pire, et pas d'un peu : un bord blanc satisfait la
lettre de la borne en la vidant de son sens, puisque n'importe quel dessin de
40 px passerait alors en ajoutant du vide. Une règle qu'on satisfait en
n'ajoutant rien est une règle qui ment.

La vraie sortie n'est ni l'une ni l'autre : **un fichier source de meilleure
définition**. Celui-ci vient d'un JPEG inséré dans un traitement de texte, et il
ne porte pas plus d'information que ça. Le jour où un logo propre existe, il
remplace l'original et la commande ci-dessous refait tout le reste.

## Refaire l'image et la constante

```python
from PIL import Image, ImageOps
src = Image.open('assets/logo-la-folie-coffee.jpg').convert('L')
# Point noir à 150, point blanc à 205 : le tirage se fait sur des imprimantes
# souvent monochromes, et un bleu simplement désaturé ressort en gris pâle où
# le rond se perd. L'anti-aliasing survit en gris, donc le tracé reste lisse.
BLACK_POINT, WHITE_POINT = 150, 205
def lut(v):
    if v <= BLACK_POINT: return 0
    if v >= WHITE_POINT: return 255
    return int(255 * (v - BLACK_POINT) / (WHITE_POINT - BLACK_POINT))
bw = src.point([lut(v) for v in range(256)])
bw = bw.crop(ImageOps.invert(bw).getbbox())       # recadre sur l'encre
side = max(bw.size)                                # carré : le logo est ROND
sq = Image.new('L', (side, side), 255)
sq.paste(bw, ((side - bw.size[0]) // 2, (side - bw.size[1]) // 2))
sq = sq.resize((256, 256), Image.LANCZOS).quantize(colors=16).convert('L')
sq.save('assets/logo-la-folie-coffee-noir-et-blanc.png', optimize=True, bits=4)
```

```bash
base64 -i assets/logo-la-folie-coffee-noir-et-blanc.png | tr -d '\n'
```

Le résultat remplace la chaîne de `brand-logo.ts`. Rien d'autre à faire : aucune
configuration de build ne dépend de ce dossier, et c'est précisément le but.
