# Servir les images au bon poids

> Ouvert le **2026-09-23**, après une question simple : « est-ce qu'on peut
> s'assurer que les images soient au bon poids pour un web optimisé ? »
>
> Écrit pour être compris sans ouvrir le code.

---

## Ce qui se passe aujourd'hui

Une image déposée dans la médiathèque part **telle quelle** au visiteur.

```
photo déposée (PNG, 8 Mo, 4000 × 3000)
   └─▶ <img src="…"> dans une tuile de rayon de 180 px de large
```

Le navigateur télécharge les 8 Mo, puis les réduit à 180 px pour les afficher.
**Vérifié le 2026-09-23** : `product-tile.html` pose `<img [src]="art().url">`,
sans plus, et aucune transformation n'existe nulle part entre le bucket et
l'écran.

Deux conséquences, et la seconde est visible à l'œil :

1. On sert des mégaoctets pour afficher des kilooctets.
2. **La page saute au chargement.** La balise ne porte ni `width` ni `height`,
   donc le navigateur ne sait pas quelle place réserver : il l'apprend quand
   l'image arrive, et tout ce qui est dessous se décale. Les dimensions sont
   pourtant **déjà** dans le fil du catalogue — elles ne servent à rien.

---

## Ce qu'il faut faire, et dans quel ordre

### ① Transformer à la lecture — le vrai gain

**Un seul original stocké, autant de versions que d'usages, calculées à la
demande.** L'écran demande la largeur dont il a besoin ; le serveur d'images la
fabrique et la garde en cache.

```
original (master, 4000 × 3000, dans R2)
   ├─▶ /cdn-cgi/image/width=360,format=auto/…   → la tuile de rayon
   ├─▶ /cdn-cgi/image/width=900,format=auto/…   → l'ouverture de fiche
   └─▶ l'original                                → le tirage papier
```

🔴 **C'est déjà la décision du schéma**, elle n'a simplement jamais été
appliquée. Le commentaire de `MediaAsset` dit : « on stocke le **master** + un
point focal ; les tailles dérivées sont calculées par **chaque canal**, jamais
ressaisies ».

**Ce que ça demande** : de la configuration, pas du code. Une case à cocher
Cloudflare si `R2_MEDIA_PUBLIC_BASE_URL` pointe sur un domaine de notre zone, et
une fonction qui réécrit l'URL côté écran.

⚠️ **À vérifier avant de décider** : est-ce que ce domaine est bien dans notre
zone Cloudflare ? Si oui, le redimensionnement est un réglage. Sinon il faut
passer par Cloudflare Images, qui est **facturé à l'image servie**. Non vérifié.

### 🔴 « Et le stockage des dérivées, alors ? » — il n'y en a pas

La question vient naturellement, et la réponse est le cœur du procédé :
**transformer à la lecture ne range rien chez nous.**

```
R2 (chez nous)              1 fichier — le master. Point.
Cache du serveur d'images   les dérivées, fabriquées à la PREMIÈRE demande,
                            expirées quand plus personne ne les demande
Cache du navigateur         ce que ce visiteur-là a reçu
```

Le cache de périphérie est **partagé** : la première personne qui demande la
tuile à 360 px la fabrique pour toutes les suivantes. Un cache de navigateur,
lui, ne sert qu'une personne.

⚠️ **Et le navigateur ne peut PAS convertir lui-même**, contrairement à ce qu'on
espère en y pensant. Il décode ce qu'il reçoit, il ne ré-encode pas. Et même
s'il le pouvait, il faudrait **d'abord télécharger** les 1,9 Mo — c'est-à-dire
exactement le coût qu'on cherche à éviter. On aurait optimisé le disque du
visiteur, pas sa connexion. La même objection vaut pour un _service worker_ qui
intercepterait : il s'exécute après le téléchargement.

⚠️ `<picture>` avec plusieurs `<source>` ne résout rien non plus : le navigateur
**choisit** parmi des fichiers qui existent, il n'en **crée** aucun. Quelqu'un
doit les avoir produits.

### ② `srcset` et les dimensions — presque gratuit

Une fois ① en place, l'écran annonce plusieurs largeurs et le navigateur choisit
celle qui convient à l'appareil — un écran Retina prend le double, un téléphone
prend le petit.

Et surtout : `width` / `height` sur la balise, **qui se font indépendamment de
①**. Les dimensions voyagent déjà jusqu'à la boutique. Les poser supprime le
décalage de mise en page, ce qui est la seule des trois corrections qu'un
visiteur remarque immédiatement.

### ③ Prévenir au dépôt — un pansement

Afficher « cette image fait 8 Mo, c'est beaucoup » au moment du dépôt.

⚠️ **Ça ne répare rien de ce qui est déjà déposé**, et ça demande à un humain de
faire ce qu'une machine fait mieux. À garder pour la fin, si tant est.

---

## 🔴 Le format est la DERNIÈRE optimisation, pas la première

Mesuré sur la base de dev le 2026-09-23 :

| Format | Images | Poids moyen | Largeur max |
| ------ | ------ | ----------- | ----------- |
| JPEG   | 3      | **1,9 Mo**  | **4808 px** |
| PNG    | 2      | 450 ko      | 1179 px     |

Un original de 4808 px servi dans une tuile de 180 px. Ce qu'on gagne selon ce
qu'on change :

| Ce qu'on change               | Ce que ça rapporte           |
| ----------------------------- | ---------------------------- |
| JPEG → WebP, taille inchangée | 1,9 Mo → ~1,3 Mo (**−30 %**) |
| Redimensionner à 360 px       | 1,9 Mo → ~30 ko (**−98 %**)  |
| Les deux                      | ~20 ko                       |

**Redimensionner rapporte cinquante fois plus que reformater.** C'est
contre-intuitif — on pense au format d'abord, parce que c'est le choix qui se
discute — et c'est pour ça que l'effort doit aller au serveur d'images plutôt
qu'à un choix de format : il fait les deux, et le gros du gain vient de la
largeur.

⚠️ Ces chiffres viennent de la base de DEV, sur cinq images. Assez pour voir la
forme du problème, pas pour en tirer une moyenne. La requête à lancer en
production :

```sql
SELECT content_type, count(*) AS images,
       pg_size_pretty(sum(bytes)::bigint) AS total,
       pg_size_pretty(avg(bytes)::bigint) AS moyen,
       max(width) AS largeur_max
FROM media.media_asset
WHERE bytes IS NOT NULL
GROUP BY content_type
ORDER BY sum(bytes) DESC;
```

### WebP contre JPEG, pour mémoire

- **~25-30 % de moins** sur une photo, à qualité visuelle égale.
- WebP sait faire la **transparence avec perte**, ce que JPEG ne sait pas du
  tout. C'est là que se cachent les mégaoctets : un packshot détouré doit
  aujourd'hui être un PNG, donc sans perte, donc énorme.
- Le seul vrai avantage du JPEG : le **rendu progressif**. Sur une connexion
  lente, on voit une version floue qui s'affine, là où un WebP apparaît d'un
  coup. À poids égal, le JPEG progressif _paraît_ parfois plus rapide.

---

## 🔴 Ce qu'on ne fait PAS : convertir au dépôt

Remplacer le fichier déposé par une version WebP, c'est perdre la source. Et ça
casserait une propriété qui a coûté cher :

**L'URL d'une image EST le SHA-256 de son contenu.** Convertir change les
octets, donc l'empreinte, donc l'URL, donc l'identité. Le redépôt idempotent
(redéposer les mêmes octets ne duplique rien) et la déduplication tomberaient
avec.

⚠️ Générer des dérivées **en plus** du master serait défendable, mais demande
`sharp` côté serveur — et `packages/storage` dit explicitement l'avoir évité.
Un serveur d'images qui transforme à la volée fait la même chose sans binaire
natif ni stockage supplémentaire.

---

## « AVIF et WebP, ça passe partout ? »

**La question ne se pose pas, et c'est tout l'intérêt du procédé.**

Chaque navigateur annonce ce qu'il sait lire, dans l'en-tête `Accept` de sa
requête. Avec `format=auto`, le serveur d'images lui répond dans le meilleur
format **qu'il a lui-même déclaré accepter** :

| Le navigateur dit     | Il reçoit |
| --------------------- | --------- |
| « j'accepte l'AVIF »  | de l'AVIF |
| « j'accepte le WebP » | du WebP   |
| il ne dit rien        | du JPEG   |

**Personne n'a à choisir à l'avance.** C'est une négociation, pas un pari — et
un navigateur ne reçoit jamais un format qu'il ne sait pas lire.

Pour situer, si la question est la couverture réelle :

- **WebP** est universel. Toutes les versions de Safari depuis 2020, tout le
  reste depuis bien avant. En pratique : personne n'est laissé de côté.
- **AVIF** couvre la très grande majorité du trafic, mais pas tout — Safari ne
  l'a accepté qu'à partir de la version 16.4 (mars 2023), donc les iPhone restés
  sur une version antérieure reçoivent du WebP. **Ils ne voient pas d'image
  cassée : ils voient la même photo, un peu plus lourde.**

### « Alors pourquoi pas que du WebP ? »

La question est juste, et sa réponse dépend entièrement de **qui convertit**.

| Qui convertit                         | Le bon choix  | Pourquoi                                                                                                                             |
| ------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Nous, au dépôt**                    | **WebP seul** | chaque format en plus double le stockage ET le calcul, pour chaque largeur. Deux formats × quatre largeurs = huit fichiers par image |
| **Un serveur d'images, à la lecture** | **`auto`**    | rien n'est stocké, rien n'est généré d'avance. C'est un cache, et il ne se remplit que de ce qu'on lui demande                       |

🔴 **Et dans le second cas, « faire moins » coûte PLUS cher.** Dans l'URL,
c'est le même paramètre :

```
/cdn-cgi/image/width=360,format=webp/…    ← « juste du WebP »
/cdn-cgi/image/width=360,format=auto/…    ← même longueur, même effort
```

Écrire `webp` au lieu de `auto` demande exactement le même travail, ne stocke
rien de moins, et se prive de 20 à 30 % d'octets pour les navigateurs qui font
mieux. C'est le seul cas où simplifier n'économise rien — pas une ligne de code
en moins, pas un format à générer, pas un cas à tester. `auto` ne rajoute pas
une branche : il en **enlève** une, puisque c'est le serveur d'images qui
décide.

⚠️ **Ce que l'AVIF coûte vraiment**, et il faut le dire : son **encodage est
lent** (la toute première demande d'une taille donnée peut traîner, le temps que
le cache se remplisse), et son **décodage est plus lourd** sur un téléphone
d'entrée de gamme. Aucun des deux ne se paie chez nous — c'est le serveur
d'images qui encode, une fois, et le résultat est mis en cache.

⚠️ **Le repli n'est pas une dégradation visible.** C'est la différence entre
« choisir un format » — où se tromper casse l'affichage — et « négocier », où le
pire cas est quelques kilooctets de plus.

Pour des photos de viennoiseries à petite taille, l'AVIF pèse nettement moins
que le WebP à qualité égale. C'est là qu'est le gain, et il va à ceux qui
peuvent le recevoir, sans priver les autres.

---

## Ce qui reste à trancher

1. **Le domaine média est-il dans notre zone Cloudflare ?** C'est la seule
   question qui décide si ① est un réglage ou une facture.
2. **Le décalage de mise en page se corrige-t-il tout de suite ?** Il ne dépend
   de rien et se voit à l'œil.
3. Et une question de fond, ouverte le même jour : **changer une image ne
   devrait pas demander de republier le catalogue.** La boutique garde une copie
   de l'URL par instantané — voir
   [`../mediatheque/plan-les-six-de-la-mediatheque.md`](../mediatheque/plan-les-six-de-la-mediatheque.md).
