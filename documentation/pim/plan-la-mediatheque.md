# La médiathèque — plan

> **Plan**, écrit le 2026-09-23. Chaque affirmation sur l'existant a été
> vérifiée en ouvrant le fichier ou la migration citée.
>
> Décision Hugo : « on fait la médiathèque accessible depuis le menu primary »,
> « son seul but serait de faire du batch import et du tag de contenu, ensuite
> dans le pim on ferait recherche et attribution ».

---

## 1. Ce qui manque n'est pas un écran, c'est une IDENTITÉ

`replaceMedia` (`prisma-editorial.repository.ts:60`) supprime les liens puis
**recrée un `MediaAsset` neuf par visuel**, identifiant neuf compris, à chaque
enregistrement de la section Visuels.

🔴 **`media_asset` n'est donc pas une bibliothèque : c'est un journal de lignes
recréées à chaque sauvegarde.** Rien à rechercher, rien à taguer, rien à
réutiliser — un actif n'a pas d'existence qui traverse deux enregistrements.

Ce qui traverse, c'est l'**URL**, parce qu'elle est adressée par contenu
(`products/{sha256}.{ext}`) : les mêmes octets donnent toujours la même adresse.
Le dépôt s'appuie déjà dessus — `factsFor(url)` reporte largeur, hauteur, poids
d'une ligne à la suivante, et depuis le 2026-09-23 le point focal aussi.

➡️ **La bibliothèque existe en creux : l'identité d'une image est son URL.** La
médiathèque ne l'invente pas, elle la rend visible — et lui donne enfin un
endroit où poser ce qui appartient aux octets plutôt qu'à une fiche.

⚠️ **Conséquence sur toute liste** : une requête naïve sur `media_asset`
montrerait la même image autant de fois qu'elle a été enregistrée. Toute lecture
de la médiathèque **groupe par URL**.

---

## 2. 🔴 La règle : on ne supprime pas une image qui sert

> Hugo, 2026-09-23 : « seule règle à noter, on ne peut pas supprimer une image
> qui a été mappée quelque part ».

**Elle est déjà tenue, et au meilleur niveau possible — par la base.** Les deux
clés étrangères vers `media_asset` sont en `ON DELETE RESTRICT` :

| Contrainte                     | Migration                                     |
| ------------------------------ | --------------------------------------------- |
| `product_media_media_id_fkey`  | `20260820160000_schema_pim`                   |
| `category_media_media_id_fkey` | `20260827090000_textes_et_visuels_de_famille` |

Postgres refuse la suppression d'un actif porté, quel que soit le code qui la
demande. C'est le deuxième barreau de l'échelle — refusé en base — et il n'y a
rien à ajouter pour obtenir la règle.

### ⚠️ Mais la règle a un angle mort, et il vient du §1

Puisque plusieurs lignes partagent une URL, « supprimer l'image » de la
médiathèque voudrait dire supprimer **toutes** les lignes portant cette URL. Or
elles ne sont pas dans le même état : les anciennes ne sont portées par
personne, la dernière l'est.

Une suppression ligne à ligne verrait donc les copies orphelines partir et la
dernière être refusée — **une image à moitié supprimée**, et une médiathèque qui
dit « échec » après avoir détruit quelque chose.

➡️ La suppression doit être **décidée sur l'URL, pas sur la ligne** : on compte
d'abord les emplois de cette URL, on refuse en entier, et on ne supprime rien
tant qu'un seul emploi existe. Le `RESTRICT` reste le filet ; il ne doit pas
être le premier à parler.

### Ce que ça ne concerne pas

Le **ramassage des orphelins** (`sweep-orphan-media`) ne touche déjà que ce que
personne ne porte, et rejoue la vérification juste avant chaque suppression. Il
obéit à la règle de Hugo sans modification.

---

## 3. Où elle vit : au premier niveau

Le menu primaire, et pas une vue du PIM.

Le précédent est écrit dans `app.html` à propos des **Outils agent** : « l'atelier
qui PILOTE le référentiel, pas un écran du référentiel : sa route est de premier
niveau ». La médiathèque est dans le même cas, avec un argument de plus :

🔴 **Elle n'appartient à aucun référentiel.** Les produits en portent, les
familles aussi (`CategoryMedia`), et les visuels de maison ou d'opération
viendront. La ranger sous « PIM » affirmerait que le référentiel produit possède
la bibliothèque — ce que le domaine dit déjà être faux :

> « Ces règles vivaient sous `product/`, du temps où une fiche était le seul
> porteur possible. […] ni l'un ni l'autre ne possède la bibliothèque. »
> — `shared/domain/value-objects/media.ts`

---

## 4. Le renversement : taguer à la source, attribuer à l'usage

| Aujourd'hui                                         | Avec la médiathèque                    |
| --------------------------------------------------- | -------------------------------------- |
| une image entre **par** une fiche                   | une image entre par la bibliothèque    |
| elle n'est nommée que si quelqu'un y pense          | elle est nommée et taguée **une fois** |
| son rôle se choisit… nulle part (sauf `hero`)       | son rôle se choisit à l'attribution    |
| la retrouver = se souvenir de quelle fiche la porte | la retrouver = chercher                |

C'est la même règle que l'inventaire des rôles avait déjà énoncée sans la
nommer : **le ratio se vérifie à l'affectation, pas au dépôt.** Un même fichier
peut servir de `hero` ici et de `lifestyle` ailleurs ; ce qui est vrai des
octets se décide au dépôt, ce qui est vrai d'un emploi se décide à l'emploi.

### Le tri, une fois pour toutes

| Appartient aux OCTETS (bibliothèque) | Appartient à l'EMPLOI (le lien) |
| ------------------------------------ | ------------------------------- |
| l'étiquette (`name`)                 | le **rôle**                     |
| les tags                             | la **position**                 |
| le **point focal**                   | le **texte alternatif**         |
| largeur, hauteur, poids, type        |                                 |

⚠️ Le texte alternatif est du côté de l'emploi, et le repository dit pourquoi :
« c'est ainsi que CE produit décrit l'image ». Ne pas le déménager dans la
médiathèque par symétrie — deux fiches n'ont pas à décrire la même photo avec
les mêmes mots.

---

## 5. Les lots

### Lot 1 — la bibliothèque se lit

`GET /catalogue/media` — la liste, **groupée par URL**, avec pour chacune :
l'étiquette, les faits mesurés, le point focal, et le **nombre d'emplois**.

Le compte d'emplois n'est pas décoratif : c'est lui qui permet à l'écran de dire
« cette image sert dans 3 fiches » **avant** de proposer de la supprimer, plutôt
que d'essuyer un refus.

### Lot 2 — l'écran, et son entrée de premier niveau

Route `/mediatheque`, entrée dans le rail primaire, grille d'aperçus.
Droit : `pim_catalog:read` pour voir, `pim_catalog:write` pour déposer.

### Lot 3 — le dépôt en lot

`POST /catalogue/media` existe et prend **un** fichier. Le lot, c'est l'écran
qui les enchaîne et rend compte fichier par fichier — l'adressage par contenu
rend le redépôt idempotent, donc une reprise après échec partiel ne duplique
rien.

### Lot 4 — nommer, taguer, pointer

L'étiquette existe déjà en base (`name`), le point focal aussi. Les **tags** sont
neufs : une table, ou un tableau de chaînes — à trancher au moment de l'écrire,
selon qu'on veut un vocabulaire fermé ou libre.

### Lot 5 — la recherche et l'attribution, côté fiche

La section Visuels gagne « choisir dans la médiathèque » à côté de « déposer »,
et c'est là que le **rôle** se choisit — les cinq, pas seulement `hero`.

### Lot 6 — la suppression

Selon §2 : décidée sur l'URL, refusée en entier dès un emploi, avec le compte
dans le message.

---

## 6. Ce que ce plan ne tranche pas

| Sujet                                                                        | Pourquoi c'est ouvert                                                                                                    |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Les tags : vocabulaire **fermé** ou libre ?                                  | un vocabulaire fermé se garde par le type, un libre se remplit vraiment. Les deux ont raison, et pas pour les mêmes gens |
| Faut-il **arrêter** de recréer un actif par enregistrement ?                 | ce serait la vraie correction du §1 — mais c'est une bascule de données, donc `vitruve` d'office et trois déploiements   |
| Les visuels de **maison** et d'**opération** rejoignent-ils la médiathèque ? | ce serait un troisième porteur ; décision non prise (cf. `plan-ouvrir-le-point-focal.md` §7)                             |
| Le journal                                                                   | une propriété de bibliothèque n'a pas de sujet à nommer ; déposer, taguer et pointer ne laisseront aucune trace          |
