# Changer une photo sans republier le catalogue

> Ouvert le **2026-09-23**. Demande de Hugo : « quand je mappe une photo sur la
> fiche produit et que je la mets en vignette, je veux qu'elle soit mise en
> vignette **sans avoir à repush le catalogue** ».

---

## 🔴 Deux problèmes empilés, et il faut les séparer

### ① « En vignette » ne voyage nulle part

Le rôle `thumbnail` existe dans le référentiel, se choisit à l'écran, se range
en base — **et s'arrête là**.

Le fil du catalogue ne porte **qu'une seule image** par produit
(`syncMediaSchema`, au singulier), et c'est le `hero` que `showcaseOf` retient.
La boutique lit ce même champ pour la tuile de rayon **et** pour l'ouverture de
fiche.

⚠️ Autrement dit : mettre une image « en vignette » aujourd'hui ne produit
**aucun effet**, même après un push. C'est le premier piège, et il est
antérieur à la question posée.

### ② Même le `hero` attend un push

`catalog_item.image_url` est une **copie**, écrite par l'ingestion d'un
instantané. Tant qu'on ne publie pas, le référentiel a la nouvelle image et le
commerce sert l'ancienne.

---

## Ce qui est acquis, et qui rend la chose faisable

✅ **Le mécanisme existe et il est légal.** `DomainEventPublisher` vit dans
`platform/events/`, donc le référentiel peut l'utiliser (`pim → platform` est
autorisé). Le commerce a déjà des abonnés `@EventsHandler`. Le référentiel
publie sans savoir qui écoute ; le commerce écoute sans importer le
référentiel. **Aucune des deux flèches interdites n'est empruntée.**

⚠️ **Mais le PIM ne publie AUCUN événement aujourd'hui** — vérifié, zéro
occurrence de `publishTraced` ou `EventBus` sous `src/pim/`. Ce serait le
premier, et ça en fait une décision d'architecture, pas un branchement.

✅ `CatalogItem` est clé par **SKU** et porte `productId` : les visuels d'un
produit se repointent par `where: { productId }`.

---

## 🔴 Le piège central : DEUX chemins d'écriture vers les mêmes colonnes

C'est le vrai sujet de ce plan, et tout le reste en découle.

```
① l'ingestion d'un instantané   ─┐
                                 ├─▶  catalog_item.image_url
② la projection à la volée      ─┘
```

Deux écrivains sur la même colonne, **et ils peuvent se contredire** : un push
complet qui arrive après une projection réécrirait `image_url` avec ce que
l'instantané portait — c'est-à-dire l'état du catalogue **au moment où
l'instantané a été fabriqué**, potentiellement antérieur au changement de
photo.

⚠️ **On annulerait la fraîcheur qu'on vient d'ajouter, sans que rien ne le
dise.**

### Ce qui résout le conflit, et pourquoi c'est confortable

Les deux écrivains lisent **la même source de vérité** : le référentiel. Ils ne
peuvent donc diverger que pendant la fenêtre où un instantané vieillit.

D'où la règle, et elle doit être écrite au-dessus des deux écritures :

- **la projection sert la fraîcheur** — elle arrive dans la seconde ;
- **le push sert la réparation** — il remet tout d'aplomb, y compris ce qu'une
  projection aurait manqué.

C'est le même couple que partout ailleurs ici : un chemin rapide et faillible,
un chemin lent et complet. Ce qui est **interdit**, c'est qu'ils lisent deux
sources différentes.

🔴 **Conséquence à ne pas manquer** : un instantané fabriqué AVANT un
changement de photo et ingéré APRÈS annulera la projection. C'est correct au
sens du modèle — l'instantané dit ce que le catalogue était — mais ça se lira
comme un bug. Deux façons de vivre avec :

- (a) **l'accepter et le dire** : un push est un acte délibéré, on sait ce
  qu'on republie ;
- (b) **dater** : l'ingestion n'écrase `image_url` que si l'instantané est plus
  récent que la dernière projection. Coût : une colonne de plus et une
  comparaison.

**Recommandation : (a) pour commencer.** La fenêtre est celle d'un push, qui
dure des minutes et se déclenche à la main. (b) devient nécessaire le jour où
la publication est automatique.

---

## Ce qu'il faut faire

### Lot 1 — que « en vignette » veuille dire quelque chose

Sans lui, la demande n'est pas satisfaite même avec une projection parfaite.

1. `syncMediaSchema` du fil gagne le `thumbnail` — donc **bump en v10**,
   `z.literal(10)` dans l'union du schéma stocké, et redéfinition de l'image
   côté stocké avec le champ en `.optional()`.
   🔴 Un champ REQUIS sur le fil rendrait illisibles les livraisons en attente
   qui portent une image : le schéma stocké réutilise celui du fil.
2. `showcaseOf` retient les DEUX rôles.
3. `catalog_items` gagne `thumbnail_url`.
4. La tuile de rayon lit `thumbnail ?? hero` ; l'ouverture de fiche lit `hero`.

⚠️ **À trancher** : que voit-on si une fiche a un `thumbnail` et pas de
`hero` ? Le repli dans les deux sens paraît évident et ne l'est pas — une
vignette cadrée serré étirée en ouverture 3/2 sera coupée n'importe comment.

### Lot 2 — la projection

1. Le référentiel publie un fait de domaine quand les visuels d'un produit
   changent (`SetProductMediaHandler`).
   ⚠️ **Ce serait le PREMIER événement du PIM.** À décider comme tel.
2. Un abonné dans `b2b/catalog` repointe `catalog_item` par `productId`.
3. La règle des deux écrivains, écrite au-dessus des deux.

⚠️ **Et le fait doit-il être journalisé ?** Le référentiel trace déjà
`product.media_saved`. Un second fait pour la même décision ferait deux lignes
d'historique pour un seul geste. La projection est une CONSÉQUENCE, pas une
décision — elle ne se journalise pas.

### Lot 3 — ce qui reste vrai quoi qu'il arrive

⚠️ **La médiathèque n'est pas concernée.** Changer l'étiquette, les tags ou le
point focal d'une image ne change pas quelle image une fiche porte. Seul le
RATTACHEMENT compte ici, et il vit dans le référentiel.

⚠️ **Le cache du serveur d'images, lui, est adressé par URL.** Une nouvelle
photo a une nouvelle URL (SHA-256 du contenu), donc rien à invalider. C'est un
bénéfice gratuit de l'adressage par contenu, et il faut le savoir pour ne pas
construire une invalidation qui ne sert à rien.

---

## Ce que ce plan N'A PAS vérifié

- **Ce qui déclenche un push de catalogue aujourd'hui**, et à quelle fréquence.
  La réponse décide entre (a) et (b) ci-dessus.
- **Si `catalog_item` est peuplé autrement que par l'ingestion** — une
  deuxième source d'écriture changerait la règle des deux écrivains en règle
  des trois.
- **Le comportement de l'ingestion face à un produit dont l'instantané ne
  porte plus d'image** : écrit-elle `NULL`, ou laisse-t-elle en place ? Ça
  décide si un push peut EFFACER une image projetée.
