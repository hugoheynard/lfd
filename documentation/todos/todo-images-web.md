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
