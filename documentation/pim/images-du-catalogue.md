# Les images du catalogue — le versant référentiel

> **Doc d'architecture**, écrite le 2026-09-23 après lecture du code.
>
> Elle décrit ce que le **référentiel** fait des visuels : ce qu'un visuel est,
> comment il se dépose, à quoi il se rattache, quand il meurt, et ce qui en sort.
>
> 👉 L'infrastructure — bucket, domaine public, coûts, gestes d'ops — vit dans
> [`ops/architecture-stockage-media.md`](../ops/architecture-stockage-media.md).
> Ce document n'y touche pas et ne la répète pas.

---

## 1. Un visuel est un objet, pas un attribut

`MediaAsset` est un **agrégat autonome** : il a son cycle de vie, et il peut
servir plusieurs produits **et** plusieurs familles à la fois.

On stocke le **master** et un **point focal** (`focalX`, `focalY`). Les tailles
dérivées sont calculées par chaque canal, jamais ressaisies — un recadrage n'est
donc pas une donnée du référentiel, c'est une conséquence du point focal.

### 🔴 Deux régimes cohabitent, et c'est ce qui explique le modèle

|                              | `storageKey`              | `contentType`, `width`, `height`, `bytes` |
| ---------------------------- | ------------------------- | ----------------------------------------- |
| **Ce qu'on héberge**         | `products/{sha256}.{ext}` | mesurés au dépôt                          |
| **Une URL saisie à la main** | `null`                    | `null`                                    |

Les colonnes techniques sont **toutes nullables** pour cette seule raison : tout
ce qui existait avant le stockage média est une URL sans clé, sans type constaté
et sans dimensions.

> `null` veut dire « pas mesuré », jamais « zéro » — un consommateur ne doit pas
> le coercer en taille.

⚠️ La distinction n'est pas cosmétique : **le ramassage d'orphelins ne touche
jamais une image à URL externe** (§5). Nous ne possédons pas ce que nous n'avons
pas déposé.

### Deux textes, deux publics

- **`alt`** — localisé (`Json`), il décrit l'image à qui ne la voit pas ;
- **`name`** — une chaîne unique, non traduite : l'étiquette de la bibliothèque,
  faite pour **retrouver** un fichier.

Les confondre reviendrait à traduire un nom de classement, ou à classer par une
description.

---

## 2. Le rattachement — deux tables, aucune clé polymorphe

```
ProductMedia  (product_id, media_id, role, position)
CategoryMedia (category_id, media_id, role, position)
```

🔴 **Les images se rattachent au PRODUIT, jamais à la déclinaison.** Une
déclinaison n'a pas ses propres visuels : « 6 parts » et « 8 parts » montrent la
même tarte.

Le schéma refuse explicitement la clé polymorphe (`owner_type` / `owner_id`) :

> …qui priverait Postgres de toute intégrité référentielle.

Deux tables coûtent une jointure de plus et rendent l'orphelin **impossible**
plutôt que détectable après coup.

### L'inventaire des rôles

`MediaRole` vaut cinq valeurs, et le domaine les range **déjà** en deux
catégories : `SINGLE_ROLES = ["hero", "thumbnail"]` — un seul visuel par
porteur, `DuplicateMediaRoleError` refuse le second — contre les trois autres,
qui sont des collections.

🔴 **Cette partition commande tout le reste.** Un ratio ne se spécifie que sur
un rôle à titulaire unique : c'est là qu'une règle peut dire « celui-ci fait
4/3 » et être opposable. Sur une collection au nombre libre, la même phrase
n'aurait personne à qui s'adresser.

| Rôle        | Cardinalité | Ratio       | Ce qu'il est                                              | Qui le lit aujourd'hui                     |
| ----------- | ----------- | ----------- | --------------------------------------------------------- | ------------------------------------------ |
| `hero`      | **un seul** | _à définir_ | l'ouverture de la fiche — le plan qui présente le produit | la vitrine du canal B2B (`showcase.ts:18`) |
| `thumbnail` | **un seul** | **4/3**     | la vignette de rayon — cadrée serré, lisible à 200 px     | **personne**                               |
| `gallery`   | plusieurs   | —           | le neutre : « une image du produit ». Tout dépôt y naît   | personne                                   |
| `lifestyle` | plusieurs   | _à définir_ | la mise en situation — table dressée, main, contexte      | personne                                   |
| `print`     | plusieurs   | _à définir_ | le tirage papier : mercuriale, étiquette, fiche imprimée  | personne                                   |

_(Colonne « qui le lit » vérifiée le 2026-09-23 : `showcase.ts` est l'unique
lecteur de rôle de tout le dépôt.)_

⚠️ **`gallery` n'aura jamais de ratio**, et ce n'est pas une case qu'on n'a pas
remplie. C'est le rôle par défaut de tout dépôt (`DEFAULT_MEDIA_ROLE`) : lui
imposer une forme refuserait des images à l'entrée de la bibliothèque, là où on
ne sait pas encore ce qu'elles serviront.

#### 🔵 La fourche que ce tableau ouvre

`hero` et `thumbnail` sont aujourd'hui **le même usage sous deux noms** : la
vitrine lit `hero` et s'en sert comme vignette de liste. Les séparer — grande
ouverture d'un côté, vignette 4/3 de l'autre — demande de basculer
`SHOWCASE_ROLE` sur `thumbnail`, **avec repli sur `hero`**, sans quoi toutes les
fiches redeviennent muettes le jour du déploiement.

Décision non prise. Ce que ce tableau tranche déjà, c'est que la vignette de
rayon est un `thumbnail` et non une `gallery` : la cardinalité le dit avant le
goût.

#### Où le ratio sera vérifié

**À l'affectation, pas au dépôt.** Un même fichier peut servir de `hero` ici et
de `lifestyle` ailleurs ; refuser à l'entrée le jugerait sur un usage qu'il n'a
pas encore. La bibliothèque accepte, le rôle exige.

_(Ni l'un ni l'autre n'existe : aucune règle de ratio n'est écrite nulle part au
2026-09-23. Ce paragraphe dit où elle ira, pas ce que le code fait.)_

---

## 3. Déposer — `POST /catalogue/media`

Multipart. Le contrôleur plafonne à **25 Mo** ; c'est une garde anti-déni de
service, pas la règle métier.

La validation métier refuse **dans cet ordre**, et l'ordre est voulu — on ne
mesure pas un fichier dont le type n'est pas accepté :

| #   | Refus                 | Seuil             |
| --- | --------------------- | ----------------- |
| 1   | fichier vide          | —                 |
| 2   | trop lourd            | **10 Mo**         |
| 3   | type non accepté      | PNG · JPEG · WebP |
| 4   | dimensions illisibles | fichier tronqué   |
| 5   | trop petit            | **200 × 200** px  |

🔴 **C'est une liste d'ACCEPTATION, pas de refus.** Ce qui n'y figure pas est
refusé — et le SVG l'est nommément : il est exécuté par le navigateur qui
l'affiche, donc l'accepter mettrait du script sur notre domaine.

⚠️ Le type est **constaté**, pas annoncé : on lit les en-têtes du fichier, on ne
croit pas son extension ni le `Content-Type` du client.

### L'adressage par contenu, et ce qu'il offre gratuitement

La clé est `products/{SHA-256 du contenu}.{ext}`. Trois conséquences :

- **la déduplication est gratuite** — le même fichier déposé dix fois ne fait
  qu'un objet ;
- **remplacer une image n'en supprime aucune** — l'ancienne peut servir ailleurs ;
- une suppression accidentelle se **répare en redéposant** le même fichier : il
  retrouve la même clé, donc la même URL.

---

## 4. Attacher — `PUT /catalogue/products/{id}/media`

La requête **remplace la liste entière**, elle ne fusionne pas. L'ordre du
tableau **est** le rang.

Détacher une image du produit ne la supprime pas : l'objet survit tant qu'un
lecteur existe, produit ou famille.

---

## 5. Le ramassage des orphelins

Cron quotidien, `30 3 * * *` UTC → `POST /admin/media/sweep`.

| Règle               | Valeur                         | Pourquoi                                                                                            |
| ------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------- |
| Délai de grâce      | **7 jours**                    | une image déposée mais pas encore enregistrée sur une fiche ne doit pas disparaître sous les doigts |
| Plafond par passage | **200**                        | ne pas saturer R2 ; le reste attend le lendemain                                                    |
| Re-vérification     | juste avant chaque suppression | la fenêtre entre le recensement et le geste                                                         |

### 🔴 L'ordre est le cœur du mécanisme

```
store.remove(storageKey)     ← l'objet R2 D'ABORD
library.forget(storageKey)   ← la ligne en base ENSUITE
```

**Jamais l'inverse.** Effacer la ligne d'abord et échouer sur R2 laisserait un
objet que plus rien ne nomme : une fuite définitive, invisible, qui se paie tous
les mois.

Dans l'ordre retenu, un échec de R2 laisse la ligne en place — l'image reste
orpheline et sera retentée au passage suivant. C'est réparable ; l'autre sens ne
l'est pas.

### Ce qu'il épargne

- les images à **URL externe** (`storageKey = null`) — nous ne les possédons pas ;
- les images encore citées par un produit **ou** par une famille. Les deux
  lectures comptent, et le doublage n'est pas évident en lisant le code.

⚠️ **Une fenêtre de course subsiste.** Si quelqu'un rattache l'image entre la
re-vérification et la suppression, l'objet part alors qu'il est vivant.
L'adressage par contenu rend le cas réparable — on redépose — mais rien ne le
signale.

---

## 5 bis. 🟢 Ce qu'on peut remonter — et pourquoi les visuels s'en tirent mieux

Le journal écrit `from` / `to` sur chaque changement. Mais il **abrège les
textes** au-delà de 120 caractères, et c'est délibéré (`journal/changes.ts`) :

> Un journal n'est pas une copie de la base : recopier une histoire produit de
> trois paragraphes à chaque virgule corrigée gonflerait la table sans rien
> apprendre — on veut savoir **que** le texte a changé, et le reconnaître d'un
> coup d'œil, **pas le relire ici**.

Cette borne crée une asymétrie **en faveur des visuels** :

|                                      | Remontable depuis le journal ?                                                                                                                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Un visuel**                        | ✅ **totalement** — le journal garde l'`url`, qui est courte et **adressée par contenu**. Elle désigne un objet qui ne peut pas changer : on ne remonte pas une description de l'image, on remonte **l'image**, à l'octet près |
| Un texte court                       | ✅ sous 120 caractères                                                                                                                                                                                                         |
| Une description longue, une histoire | ❌ tronquée                                                                                                                                                                                                                    |

➡️ **L'adressage par contenu paie une troisième fois** (après la déduplication
et la réparation par redépôt, §3) : il rend l'historique visuel exact sans que
le journal grossisse d'un octet.

⚠️ Ne vaut **que pour ce que nous hébergeons.** Une URL saisie à la main n'est
pas adressée par contenu : ce qu'elle sert peut changer sans nous, et le journal
n'en garde alors qu'un pointeur vers quelque chose d'instable.

### 🔵 La piste, pour le jour où les textes longs devront se remonter

Gonfler le journal serait la mauvaise réponse — c'est précisément ce que la
borne refuse. Le dépôt porte déjà le bon outil ailleurs : **`CatalogContent`**,
_« un contenu, adressé par son empreinte »_, le magasin partagé des révisions.
Deux révisions qui partagent quatre-vingt-dix articles inchangés y partagent
quatre-vingt-dix lignes.

Le même motif servirait un historique éditorial sans rien gonfler : une virgule
corrigée écrirait **une ligne**, pas un paragraphe recopié.

Noté comme piste, pas comme manque (Hugo, 2026-09-23) : rien ne l'exige
aujourd'hui.

---

## 6. Ce qui sort

- **Vitrine B2B** — le `hero` du produit (§2).
- **Projection catalogue** — chaque produit porte un `SyncMedia | null` dans le
  snapshot envoyé à la plateforme professionnelle.
- **Boutique** — `ShopItemView.image`, optionnel ; sans image, elle affiche une
  illustration de rayon.

🔵 **Non établi**, et c'est le seul trou de ce document : la boutique reçoit-elle
aujourd'hui les images du référentiel, ou n'affiche-t-elle que ses replis ? Le
contrat existe des deux côtés ; le branchement de bout en bout n'a pas été tracé
jusqu'à l'affichage. À vérifier en regardant, pas en lisant.

---

## 7. Les écrans du back-office

Section **Visuels** de la fiche produit, et son équivalent sur la famille.

| Geste            | Ce qui se passe                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------- |
| Déposer          | `POST /catalogue/media`, l'image entre dans la liste **sans être enregistrée** sur la fiche |
| Texte alternatif | un panneau par image, **une langue par champ**                                              |
| Réordonner       | glisser-déposer, purement local jusqu'à l'enregistrement                                    |
| Retirer          | retire de la liste — **aucun `DELETE` HTTP**, l'image peut servir ailleurs                  |
| Enregistrer      | un seul `PUT`, la liste entière                                                             |

✅ Le panneau d'alternative **n'écrit aucune liste de langues en dur** : il lit
`LOCALES` du contrat. Ajouter une langue au catalogue ajoutera son champ tout
seul.

⚠️ **Le front ne pré-valide rien.** Déposer un SVG, un fichier de 40 Mo ou une
vignette de 80 px part au serveur et revient en erreur. C'est correct — le
serveur reste l'autorité — mais l'aller-retour est inutile, et le message
d'erreur arrive loin du geste.

---

## 8. Ce qui reste ouvert

| Sujet                                                   | État                                                                                                                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La boutique affiche-t-elle vraiment les images du PIM ? | **non établi** (§6)                                                                                                                                                                                                       |
| Pré-validation côté écran                               | absente — type, poids et dimensions sont connus du navigateur                                                                                                                                                             |
| Fenêtre de course du ramassage                          | connue, réparable, non signalée                                                                                                                                                                                           |
| Le plafond de 200 a-t-il déjà mordu en production ?     | le code le journalise (`capped`) ; jamais constaté                                                                                                                                                                        |
| Les **ratios** des quatre rôles à forme                 | seul `thumbnail` est fixé (4/3) ; `hero`, `lifestyle` et `print` attendent une valeur de Hugo (§2)                                                                                                                        |
| `hero` et `thumbnail` séparés ou confondus              | **fourche ouverte** (§2) — la bascule de `SHOWCASE_ROLE` exige un repli, sinon toutes les fiches redeviennent muettes                                                                                                     |
| Point focal                                             | stocké en base, et **rien d'autre** — absent des contrats, donc ni saisi ni servi (vérifié le 2026-09-23). §1 le présente comme ce qui dispense de ressaisir les recadrages ; c'est vrai du modèle, pas encore de l'usage |
