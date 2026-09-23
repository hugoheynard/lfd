# La médiathèque

> **Doc d'architecture**, écrite le 2026-09-23 contre le code livré. Elle décrit
> ce qui EST.
>
> Ce qui reste à faire vit dans
> [`../todos/todo-mediatheque.md`](../todos/todo-mediatheque.md) ; ce que le
> chantier a coûté et appris vit dans les deux plans qu'il a exécutés
> ([`plan-la-mediatheque.md`](plan-la-mediatheque.md),
> [`plan-la-mediatheque-bloc-a-part.md`](plan-la-mediatheque-bloc-a-part.md)).

---

## 1. Ce que c'est, et à qui ça n'appartient pas

La médiathèque est le **fonds d'images de la maison** : `src/media/`, schéma
Postgres `media`, routes `/media`, écran de premier niveau `/mediatheque`.

🔴 **Elle n'appartient à aucun référentiel.** Les fiches produit portent des
visuels, les familles aussi, les contenus de la vitrine en porteront. Le
domaine le disait avant que le bloc existe :

> « Ces règles vivaient sous `product/`, du temps où une fiche était le seul
> porteur possible. Une FAMILLE en porte aussi désormais […] ni l'un ni l'autre
> ne possède la bibliothèque. »

C'est cette phrase qui a fini par déplacer un dossier.

### L'identité d'une image est son URL

`products/{SHA-256}.{ext}` : la clé de stockage **est** le hachage du contenu.
Trois propriétés en découlent, et tout le reste s'y appuie :

- **déduplication gratuite** — les mêmes octets tombent sur la même clé, donc
  sur la même entrée ;
- **redépôt idempotent** — reprendre un lot à moitié échoué ne duplique rien,
  et une suppression regrettée se répare en reposant le fichier ;
- **identité stable** — une URL survit à tout, là où un identifiant de ligne ne
  survivait même pas à un enregistrement de fiche (§7).

⚠️ Ce que la réparation NE rend pas : les mots-clés, l'étiquette et le point
focal. Ils décrivent l'image, pas ses octets.

---

## 2. Deux blocs, deux canaux, aucun propriétaire

`pim` et `media` sont les deux **aux deux côtés d'un canal** — le cas que
`handover` était seul à connaître. Chacun déclare ce dont il a besoin, l'autre
implémente, et `appBootstrap` relie.

| Canal                      | Déclaré par    | Implémenté par | Ce qu'il porte                                          |
| -------------------------- | -------------- | -------------- | ------------------------------------------------------- |
| `pim/channels/media/`      | le référentiel | la médiathèque | « décris-moi ces images », « celle-ci existe-t-elle ? » |
| `media/channels/carriers/` | la médiathèque | le référentiel | « qui affiche cette image ? »                           |

🔴 **Aucun des deux ne lit la table de l'autre**, et ce n'est pas une
convention : `lint:prisma-model-ownership` dit qu'« un modèle a UN
propriétaire, et lui seul le lit ». La porte a mordu le jour même où on l'a
armée sur le nouveau bloc — c'est elle qui a imposé le second canal.

⚠️ **Le sens des flèches est celui de l'IMPORT, pas de la donnée.** Un bloc qui
publie un port ne doit pas connaître ceux qui le branchent, sinon la dépendance
revient par l'autre bout.

### Ce que la médiathèque atteint de la base

Une ligne. Sa surface Prisma (`MediaPrismaService`) ne déclare que
`mediaAsset`, là où celle du référentiel en déclare 47. Tant qu'elle passait
par celle du PIM, elle pouvait atteindre tout ce que celle-ci déclare — un mur
tombé sans que personne ne l'écrive.

---

## 3. Ce qui appartient à l'image, ce qui appartient à l'emploi

C'est **la** règle de partage, et elle décide de tout le reste.

| Appartient à l'IMAGE (bibliothèque) | Appartient à l'EMPLOI (le porteur) |
| ----------------------------------- | ---------------------------------- |
| l'étiquette (`name`)                | le **rôle**                        |
| les **mots-clés**                   | la **position**                    |
| le **texte alternatif**             |                                    |
| le **point focal**                  |                                    |
| largeur, hauteur, poids, type       |                                    |

🔴 **Le texte alternatif a changé de côté le 2026-09-23** (décision Hugo : « un
seul point dans la médiathèque »), et cette décision contredit une
justification qui vivait dans le code :

> « Une ligne par lien, et non une ligne partagée : le `alt` appartient à la
> FICHE (c'est ainsi que CE produit décrit l'image), et partager la ligne
> ferait qu'en corriger un changerait silencieusement l'autre. »

**Cette phrase n'est pas devenue fausse : elle est devenue assumée.** Corriger
l'alternative d'une image change ce que toutes les fiches en disent — c'est le
sens de « un seul point ». Ce qui a fait pencher la balance : une alternative
décrit l'image, pas ce que la fiche en fait, et une correction se fait une
fois.

⚠️ **Conséquence d'écran**, qui n'était dans aucun plan : le panneau de la
fiche produit s'appelait « texte alternatif » et n'en porte plus. Il ne reste
que l'usage et le retrait. Qui rédige une fiche va décrire l'image ailleurs.

---

## 4. Les cinq usages d'un visuel

`MediaRole` vaut `hero`, `gallery`, `lifestyle`, `thumbnail`, `print`. Le
domaine les range en **deux catégories**, et c'est cette partition qui décide
où un ratio peut s'écrire :

| Rôle        | Cardinalité | Ratio | Qui le lit              |
| ----------- | ----------- | ----- | ----------------------- |
| `hero`      | **un seul** | 3/2   | la vitrine du canal B2B |
| `thumbnail` | **un seul** | 4/3   | personne                |
| `gallery`   | plusieurs   | —     | personne                |
| `lifestyle` | plusieurs   | 16/9  | personne                |
| `print`     | plusieurs   | 1/1   | personne                |

🔴 **Un ratio ne se spécifie que sur un rôle à titulaire unique.** Sur une
collection au nombre libre, la règle n'aurait personne à qui s'adresser. C'est
aussi pourquoi `gallery` n'aura jamais de ratio : c'est le rôle par défaut de
tout dépôt, et lui imposer une forme refuserait des images à l'entrée de la
bibliothèque, avant qu'on sache à quoi elles serviront.

**L'unicité appartient au VERBE**, pas à une vérification : `setMediaRole`
repasse sur la liste en une mise à jour et déloge celui qui portait le même
rôle unique. Deux ouvertures sont _inexprimables_, pas interdites.

⚠️ Et il ne déloge **que** le porteur du même rôle. Le geste rendait tous les
autres à `gallery` — sans conséquence tant qu'un seul usage avait un écran,
destructeur dès qu'on a ouvert les quatre autres.

_(Ratios : voir [`../pim/images-du-catalogue.md`](../pim/images-du-catalogue.md)
§2. Rien ne les fait respecter — cf. le TODO.)_

---

## 5. Les mots-clés : libres, à plat, normalisés

Un `String[]` sur l'image, indexé en GIN. Pas d'arbre, pas de racine, pas de
mot imposé à l'entrée.

C'est un choix **contre** le précédent des catégories d'allergènes, et il se
défend : un vocabulaire fermé ou structuré se garde par le type et ne se
remplit jamais ; un vocabulaire libre se remplit vraiment.

⚠️ **La contrepartie est assumée** : rien ne rapprochera « croissant » de
« viennoiserie ». Une image mal taguée reste introuvable jusqu'à ce qu'on la
retague. C'est le prix d'un champ que les gens remplissent.

🔴 **La seule règle, et elle n'est pas négociable : la normalisation.**
Découpé, minuscules, dédoublonné. Sans elle, « Croissant » et « croissant »
sont deux fonds distincts, et le vocabulaire libre devient le vocabulaire à
doublons qu'on lui reproche.

### La bande, plutôt qu'un panneau par image

Le vocabulaire est **dérivé** — ce que les images chargées portent, plus ce
qu'on vient d'écrire. Il n'y a pas de table de tags : sans hiérarchie ni
propriétés, elle n'apporterait qu'une jointure, et un second endroit où le
vocabulaire pourrait diverger de son usage.

Un tag se **pose** : glisser-déposer, doublé d'un clic qui **arme** — on ne
glisse pas au clavier, et une bande utilisable à la seule souris fermerait
l'écran à qui navigue autrement.

---

## 6. Le point focal

Fractions de 0 à 1 depuis le coin haut-gauche, jamais des pixels : l'image est
recadrée à des tailles qu'on ne connaît pas.

🔴 `null` veut dire « **personne ne s'est prononcé** », et pas « au centre ».
Le centre est un choix comme un autre ; les confondre retirerait le moyen de ne
pas décider.

Il existe en base depuis l'origine du modèle et n'a eu **aucun lecteur pendant
des mois** — deux colonnes et une intention. Il se saisit désormais d'un clic
sur l'aperçu ; personne ne le lit encore (cf. le TODO).

⚠️ C'est lui, et pas un ratio, que réclament les cartes **sans forme** — celles
dont le texte fixe la hauteur et la fluidité la largeur, comme « Je passe la
prendre » ou l'opération datée de l'accueil. Un ratio ne se demande qu'à un
conteneur qui en a un.

---

## 7. Une image, une ligne — et pourquoi ça ne l'était pas

Jusqu'au 2026-09-23, enregistrer la section Visuels d'une fiche **détachait
tout et recréait un `MediaAsset` neuf par visuel**. La table n'était pas une
bibliothèque mais un journal de lignes : une même image y figurait autant de
fois qu'on avait sauvé les fiches qui la portent.

Conséquences, toutes mesurées :

- aucune identité ne traversait deux sauvegardes — d'où la lecture groupée par
  URL, qui a survécu comme garde ;
- chaque décision prise sur l'image (point focal, mots-clés) devait être
  **reportée** de ligne en ligne, sous peine de disparaître à la sauvegarde
  suivante ;
- et le référentiel **écrivait** donc la bibliothèque, ce qui lui en donnait la
  propriété au sens de la porte des modèles — et rendait le déménagement
  impossible.

Un index UNIQUE sur `url` rend désormais le doublon **inexprimable**. Tout le
mécanisme de report a disparu avec sa cause.

---

## 8. 🔴 On ne supprime pas une image qu'un porteur affiche

> Hugo, 2026-09-23 : « on ne peut pas supprimer une image qui a été mappée
> quelque part ».

La règle a **changé de gardien** le jour où la bibliothèque a pris son schéma.

|                            | Avant                           | Depuis                            |
| -------------------------- | ------------------------------- | --------------------------------- |
| Qui refuse                 | Postgres (`ON DELETE RESTRICT`) | le code                           |
| Ce qu'il faut pour refuser | rien                            | interroger tous les porteurs      |
| Ce qu'un refus dit         | « violation de contrainte »     | **combien** de fiches l'affichent |

Deux gardiens, et ils existaient **avant** la migration :

- `DiscardMediaHandler` compte les emplois par le canal et refuse en **409**,
  avec leur nombre — un « impossible » sans chiffre laisse chercher lesquelles ;
- le **ramassage d'orphelins** interroge les porteurs et **échoue** si l'un
  d'eux se tait. Le silence ne vaut pas « zéro emploi » : sans cette
  propagation, une panne de port deviendrait un effacement de masse.

⚠️ Le comptage n'est **pas** une autorisation : il vaut à l'instant de la
lecture. C'est pourquoi le balayeur le rejoue juste avant chaque suppression —
ça ne ferme pas la fenêtre, ça la réduit à quelques millisecondes.

### L'ordre est la sûreté

**L'objet d'abord, les lignes ensuite.** L'inverse est tentant (la base est plus
rapide) et il est faux : supprimer les lignes puis échouer sur R2 effacerait la
seule trace de ce qu'il reste à supprimer, et l'octet resterait dans le bucket
sans que rien au monde ne puisse le désigner.

À l'endroit, l'échec laisse des lignes qui pointent un objet disparu, qu'aucun
porteur n'affiche : inoffensif, et ramassé au passage suivant.

---

## 9. Ce que la médiathèque journalise

Trois faits, et pas un seul « image modifiée » : la question qu'on pose au
journal d'une bibliothèque est justement **laquelle des trois**.

| Fait                    | Ce qu'il affirme                                                    |
| ----------------------- | ------------------------------------------------------------------- |
| `media_asset.deposited` | une image entre dans le fonds                                       |
| `media_asset.described` | son étiquette, ses mots-clés, son alternative ou son point changent |
| `media_asset.discarded` | elle en sort, octets compris                                        |

Le **sujet est l'URL** : les identifiants de ligne ne désignaient rien de
durable.

🔴 Le port d'écriture exige un `WriteTicket`, qu'on n'obtient qu'en traçant ou
en dérogeant nommément. **Écrire sans avoir rien affirmé est inexprimable.**

⚠️ Le **ramassage** déclare `@sans-journal` avec sa raison : une passe
automatique n'a pas d'auteur, et un fait sans acteur noierait ceux auxquels la
question « qui a changé ça » s'applique vraiment. Ce qui le remplace est le
rapport en sortie, qui dit **toujours** quand le plafond a mordu.

---

## 10. Les gestes, et où ils vivent

| Geste                    | Où                      | Ce qu'il fait                                                                     |
| ------------------------ | ----------------------- | --------------------------------------------------------------------------------- |
| Déposer en lot           | médiathèque             | enchaîne, **ne s'arrête jamais** sur un refus, garde les refusés pour les rejouer |
| Nommer, décrire, pointer | médiathèque             | le seul point où ces champs s'écrivent                                            |
| Taguer                   | médiathèque, à la bande | un mot posé sur autant d'images qu'on veut                                        |
| Retirer du fonds         | médiathèque             | refusé dès qu'un porteur l'affiche                                                |
| Choisir une image        | fiche produit           | cherche par étiquette et mots-clés, **jamais** par nom de fichier                 |
| Donner un usage          | fiche produit           | les cinq rôles, avec leur ratio dans le libellé                                   |
| Retirer de la fiche      | fiche produit           | **ne touche pas** la bibliothèque                                                 |

Le dépôt en lot est **séquentiel**, et pas par prudence : le serveur lit les
octets en mémoire pour les mesurer, avec une garde de transport à 25 Mo. Vingt
fichiers en parallèle, c'est vingt tampons dans un processus qui sert aussi le
back-office.

---

## 11. Ce que le référentiel a le droit de faire

Depuis le 2026-09-23, il **désigne** et ne fabrique plus :

- une fiche ne peut porter qu'une image **déposée** — le visuel par simple URL
  a disparu, et c'est ce départ qui a libéré le déménagement ;
- le rattachement ne porte que l'**URL**, le **rôle** et la **position** ;
- aucune écriture du référentiel n'atteint la bibliothèque.

⚠️ Ce qu'on a perdu : illustrer depuis une banque d'images distante sans copier
l'octet. Ce qu'on gagne : toute image du catalogue est chez nous, mesurée, et
ne disparaît pas parce qu'un tiers a rangé son serveur.
