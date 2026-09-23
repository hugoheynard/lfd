# Ouvrir le point focal

> **Plan**, écrit le 2026-09-23 après lecture du code livré. Chaque affirmation
> sur l'existant a été vérifiée en ouvrant le fichier cité.
>
> Il fait suite à l'inventaire des rôles
> ([`images-du-catalogue.md`](../pim/images-du-catalogue.md) §2) et répond à une
> question de Hugo qui a déplacé le sujet : « quel serait le format de la carte
> _je passe la prendre_ ? ou même le format d'une opération datée ? »

---

## 1. Pourquoi le ratio ne suffisait pas

Les deux cartes citées **n'ont pas de forme**, et c'est mesuré :

| Carte                   | Fichier              | Géométrie                                                             |
| ----------------------- | -------------------- | --------------------------------------------------------------------- |
| « Je passe la prendre » | `service-doors.scss` | `flex: 1 1 270px` · `min-height: 308px` · photo `inset: 0` en `cover` |
| L'opération datée       | `event-banner.scss`  | `min-height: 132px`, `152px` au-delà de 900 px · `center 42% / cover` |

La hauteur est un **plancher** que le texte pousse ; la largeur est fluide. La
photo prend donc la forme que la carte a prise, laquelle n'est jamais deux fois
la même.

🔴 **Un ratio ne se spécifie que là où le conteneur a une forme fixe.** `hero`
en 3/2 tient parce que la fiche annonce un rectangle. Demander un ratio à une
carte qui rognera de toute façon serait une phrase que rien ne peut honorer.

Ce que ces cartes réclament, c'est **« quoi qu'il arrive, garde ce point »**.
Et le `center 42%` du bandeau en est l'aveu : quelqu'un a décalé le cadrage à la
main parce que le sujet sortait par le haut. Une valeur juste, écrite au mauvais
endroit — elle vaut pour **une** photo, dans **une** carte, et meurt au
changement d'image.

---

## 2. Ce qui existe déjà, et ce qui n'existe pas

`MediaAsset` porte `focalX Float?` / `focalY Float?` (`editorial-media.prisma`),
depuis l'origine du modèle. Le JSDoc du schéma en dit même la raison : « on
stocke le master + un point focal ; les tailles dérivées sont calculées par
chaque canal, jamais ressaisies ».

**Il n'a aucun lecteur et aucun écrivain.** Vérifié le 2026-09-23 : hors client
Prisma généré, `focalX` n'apparaît nulle part — ni contrat, ni domaine, ni
route, ni écran. Deux colonnes et une intention, sans une ligne de code.

---

## 3. 🔴 Ce qui rend le sujet non trivial

`replaceMedia` (`prisma-editorial.repository.ts:60`) **supprime les liens puis
recrée un `MediaAsset` neuf par visuel**, avec un identifiant neuf, à chaque
enregistrement de la section.

La bibliothèque n'est donc pas une bibliothèque : c'est un journal de lignes
créées à chaque sauvegarde. **Un identifiant d'actif ne survit pas à un
enregistrement.**

Ce qui survit, c'est l'**URL** — et elle survit bien, parce qu'elle est adressée
par contenu (`products/{sha256}.{ext}`) : les mêmes octets donnent toujours la
même adresse.

Le dépôt s'en accommode déjà, et c'est la pièce à copier. `factsFor(url)` relit
les faits mesurés depuis la dernière ligne connue pour cette URL et les reporte
sur la ligne neuve — c'est ainsi que largeur, hauteur et poids traversent les
enregistrements sans être redemandés au navigateur.

➡️ **Le point focal doit voyager par le même canal, sans quoi il serait effacé
au premier enregistrement de la section qui le porte.** C'est une ligne dans
`factsFor` ; l'oublier produirait une fonctionnalité qui marche à l'écran et
disparaît à la sauvegarde suivante — la pire des deux.

---

## 4. Où il vit : sur l'IMAGE, pas sur l'emploi

Le modèle tranche déjà, et il a raison : la colonne est sur `MediaAsset`.

Le sujet d'une photo ne change pas selon le produit qui l'affiche. Un croissant
au tiers gauche du cadre y est pour toutes les fiches à la fois. Poser le point
sur le **lien** (`ProductMedia`) obligerait à le repointer pour chaque emploi,
et deux fiches finiraient par ne pas s'accorder sur où est le croissant.

⚠️ C'est l'inverse du **texte alternatif**, qui est bien sur le lien, et dont le
repository dit pourquoi : « c'est ainsi que CE produit décrit l'image ». La
règle de tri est nette — **ce qui décrit les octets va sur l'actif, ce qui
exprime une intention éditoriale va sur le lien.** Le point focal décrit les
octets.

---

## 5. Ce qu'il n'est PAS : un fait mesuré

`MediaFactsView` (contrat) annonce « ce qu'on a **constaté** d'un visuel qu'on
héberge », et son JSDoc insiste : `null` veut dire « pas mesuré ».

Le point focal est **décidé**, pas constaté. L'y ranger rendrait cette phrase
fausse pour un de ses champs — exactement le commentaire dangereux du
`CLAUDE.md` §8, qui ne se démasque jamais en relisant le fichier qu'il
surplombe.

➡️ Il prend donc sa propre forme, à côté :

```ts
/**
 * Le point à garder au centre quand le cadre n'a pas la forme de l'image.
 * Fractions de 0 à 1, depuis le coin haut-gauche.
 *
 * DÉCIDÉ, pas mesuré — d'où sa place hors de `MediaFactsView`. `null` veut
 * dire « personne ne s'est prononcé », et le cadrage retombe alors au centre.
 */
export interface FocalPoint {
  readonly x: number;
  readonly y: number;
}
```

🔴 **Le tri-état est le même que celui des allergènes** : pas de valeur ≠ valeur
au centre. `{ x: 0.5, y: 0.5 }` est une décision — « le centre est le bon
endroit » — et `null` est son absence. Les distinguer ne coûte rien
aujourd'hui et évite d'avoir à deviner demain lequel des deux on lit.

---

## 6. Les lots

### Lot 1 — la colonne survit

- `factsFor` relit et reporte `focalX` / `focalY` avec les autres faits.
- Un test de régression **nommé** : « le point focal survit à un enregistrement
  de la section ». Il doit échouer avant le correctif.

Sans ce lot, aucun autre ne tient.

### Lot 2 — il se lit

- `FocalPoint` au contrat ; `AttachedMediaView` et `UploadedMediaView` gagnent
  `focal: FocalPoint | null`.
- `ProductMediaRecord` (port de lecture) le porte, rempli depuis `row.media`.
- La projection du canal B2B le sert à côté de `width` / `height`.

### Lot 3 — il s'écrit

Une route **dédiée**, sur la bibliothèque, clé = l'URL :

```
PUT /catalogue/media/focal   { url, focal: { x, y } | null }
```

🔴 **Pas dans le `PUT` des visuels d'un produit.** Cette route-là est un
remplacement de liste : y faire voyager une propriété de la bibliothèque
ferait qu'enregistrer la fiche A repose le point choisi depuis la fiche B. C'est
la leçon §6a de la séparation allergènes / nutrition — « le port dédié ne rend
pas l'écriture sûre ; il fait qu'une écriture ne peut plus en détruire une autre
qu'elle ne visait pas ».

L'écriture vise **toutes** les lignes portant cette URL (`updateMany`) : l'URL
est l'identité de l'image, et les lignes n'en sont que des copies successives.

### Lot 4 — il se saisit

Dans le panneau par image qui existe déjà (`alt-text-panel`) : un clic sur
l'aperçu pose le point, une pastille le montre, un bouton l'efface.

Ce panneau est le bon endroit et pas seulement le plus proche — il est **déjà**
le lieu du « ce que je dis de CETTE image », et il sait déjà rendre un contrôle
conditionnel (`isMain` n'y apparaît que là où la notion existe).

### Lot 5 — il sert

- La fiche boutique : `object-position` calculé depuis le point, à côté de son
  `aspect-ratio: 3 / 2`.
- Les deux cartes de l'accueil, **si** elles rejoignent le référentiel (§7).

---

## 7. ⚠️ Ce que ce plan ne couvre pas, et qu'il faut savoir

**Les deux cartes qui ont motivé le sujet ne viennent pas du PIM.**

- La photo des portes est une variable CSS posée par `accueil-public.scss` — la
  photo du fournil, servie aussi au bandeau. Celle du coursier est un **repli**
  sur la même, et le commentaire le dit provisoire (Hugo, 2026-09-20 : « une
  photo pour voir »).
- L'image de l'opération datée est une URL Unsplash en dur dans `mock-event.ts`,
  un fichier qui se déclare lui-même une simulation.

Ce sont des visuels **de maison** et **d'opération**, pas de produit. Les faire
entrer dans l'inventaire ne serait pas une ligne de plus au tableau des rôles :
ce serait un **troisième porteur**, à côté du produit et de la famille. Décision
non prise, et hors de ce plan.

Le point focal leur profitera quand même le jour où elles y entreront — c'est
l'ordre qui compte : d'abord le mécanisme sur le porteur qui existe.

### 🔵 Le trou connu : le journal

Le point focal, écrit par sa propre route, **ne produit aucun fait**. Le journal
est indexé par sujet (`product`, `category`) ; une propriété de bibliothèque n'a
pas de sujet à nommer.

Conséquence assumée : on ne pourra pas dire qui a déplacé un point, ni le
remonter. C'est acceptable pour un recadrage — un clic le repose — et ça ne
l'est pas pour une donnée réglementaire. **La dire ici évite qu'on la découvre
en cherchant la trace.**
