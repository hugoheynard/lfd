# Le poste de colisage — plan

_Écrit le 2026-09-13. État : doc-first au moment de l'écriture._

## Ce que c'est

Un écran d'**exécutant**, jumeau de la fiche d'atelier et pas son doublon.

|                | Fiche d'atelier                    | Poste de colisage     |
| -------------- | ---------------------------------- | --------------------- |
| La clé         | le **rayon**                       | la **commande**       |
| La question    | qu'est-ce qu'on sort du four       | ce bac est-il complet |
| Ce qu'on coche | un article, tous clients confondus | une ligne d'un bon    |

Le colisage est une **balance** : la ressource sortie du four d'un côté, le bon
de commande de l'autre. On coche en remplissant, et le reste à répartir se voit
avant qu'il manque, pas après.

🔴 **Ce n'est pas le retrait.** Ce qui se passe ici reste au fournil : le bac est
fermé, il n'a changé de mains avec personne. Le geste de remise vit dans
`handover/`, dont la clé n'est même pas la journée.

## Deux états, et un seul est réversible

- **Cocher une ligne** est un état de travail, réversible. Une ligne cochée les
  doigts farinés se reprend — même arbitrage que la coche de la fiche d'atelier.
- **Fermer le bac** (`packed_at` sur `production_order`) est le fait
  irréversible, celui que `OrderPackedEvent` annonce et dont le commerce tire
  son `ready`. Rien ne le rouvre : un colis annoncé prêt à un client ne se
  déclare pas non prêt par une case décochée.

⚠️ **Asymétrie assumée sur la fermeture.** L'écran n'active « fermer le bac »
que quand toutes les lignes sont cochées. La route de scan
(`POST batch/:date/sheets/:reference/packed`) reste, elle, **inconditionnelle** :
elle est encodée dans les QR des feuilles d'atelier **déjà imprimées et en
circulation**, et y ajouter une condition ferait échouer un papier qui est
physiquement sur un plan de travail. L'écran est plus exigeant que la route ;
la route ne ment pas pour autant, elle constate un geste attesté.

## Le modèle

Additif, et calqué sur ce que `production_count` porte déjà :

```
production_order_line  + packed_at       timestamptz null
                       + packed_by       text null
                       + packed_initials text not null default ''
```

`packed_at = null` est le seul état « pas dans le bac ». L'agrégat ne produit
jamais un auteur sans instant — même invariant que `DoneMark`.

Aucune colonne de ressource : `remaining` se **calcule** à la lecture
(`production_count.quantity` moins la somme des lignes cochées du jour). Le
stocker créerait un second endroit où la vérité peut dériver, pour économiser
une agrégation sur quelques dizaines de lignes.

## Les surfaces

| Route                                                 | Ce qu'elle fait                              |
| ----------------------------------------------------- | -------------------------------------------- |
| `GET admin/production/packing?date=`                  | les bacs **et** la ressource, en une lecture |
| `PUT …/packing/:date/sheets/:reference/lines/:sku`    | la ligne est dans le bac                     |
| `DELETE …/packing/:date/sheets/:reference/lines/:sku` | elle n'y est plus                            |
| `POST …/batch/:date/sheets/:reference/packed`         | **existe déjà** — ferme le bac               |

Une seule lecture pour les deux plateaux de la balance : ils n'ont de sens que
pris au même instant. Deux appels laisseraient une fenêtre où le reste affiché
ne correspond à aucun état réel.

## L'écran

`/production/colisage`, troisième vue du rail du fournil, et
`/colisage/:reference` — l'adresse **déjà encodée dans les QR imprimés**. Elle
ouvre le poste sur la commande de cette référence.

🔴 **Ce plan a affirmé que cette route n'existait pas et que le QR tombait sur
une 404. C'était FAUX**, et corrigé le 2026-09-13 même. Elle existe depuis
`4fc90f95`, avec son écran (`app/colisage/colisage-page/`). L'erreur vient d'un
`grep` dont le shell avait rejeté le motif : l'absence de résultat a été lue
comme une absence de code, alors que la commande n'avait rien cherché. Ce que ce
chantier fait n'est donc pas **ouvrir** une porte fermée, c'est **remplacer** un
écran de scan par un poste de préparation — et l'ancien écran est supprimé dans
le même geste, sans quoi deux composants répondraient à la même adresse.

La journée se **déduit** comme celle de la fiche d'atelier : demain si son plan
est arrêté, aujourd'hui sinon. Un sélecteur de plus serait une question de plus
à 4 h du matin.

> 🔴 **Plus de file hors ligne depuis le 2026-09-14** (décision de Hugo) : une
> coche part directement au serveur, et revient en arrière en le disant si elle
> échoue. Le paragraphe suivant est celui du plan d'origine.

Les coches passent par la file hors ligne du fournil, pour la raison qui l'a
fait naître : le sous-sol. Jamais un écran qui a l'air d'avoir enregistré alors
que non.

---

## Ce qui s'est ajouté pendant la construction

_Le 2026-09-13, devant l'écran. Ces trois points ne figuraient pas au plan
d'origine — ils sont inscrits ici parce qu'un document en retard sur son code
envoie chercher au mauvais endroit._

### Une ligne pas encore sortie du four n'est pas cochable

🔴 **C'était le vrai trou**, et il ne se voyait qu'en regardant l'écran : rien
n'empêchait de mettre dans un bac un article que le four n'avait pas rendu. La
balance comptait alors comme réparti ce qui n'existait pas, et le reste
affiché devenait faux **dans le seul sens qui coûte** — optimiste.

La fiche d'atelier porte déjà la réponse (`production_count.done_at`), dans le
même agrégat : aucune frontière à traverser. Un SKU est en attente s'il n'est
pas coché **ou** s'il est absent du compte — ce second cas étant celui d'un
article arrivé après le tirage.

Le refus vit dans l'agrégat (`lineToFill`), pas seulement dans l'écran : une
case grisée n'est pas une règle, la route reste ouverte, et un rejeu de la file
hors ligne passerait à travers.

⚠️ **Décocher reste permis.** Si une coche de fiche d'atelier est reprise, ce
qui est déjà dans le bac doit pouvoir en sortir. `lineToPack` porte donc ce qui
vaut dans les deux sens, `lineToFill` y ajoute le refus du four.

### Une commande porte son nombre de containers

`production_order.container_count`, additif, figé avec la fermeture comme le
reste. **Un compte, pas une liste** — ce qu'on sait aujourd'hui, c'est combien.
Le jour où chaque produit se posera dans un container nommé, ce nombre en sera
la longueur, et ce qui aura été compté d'ici là restera vrai.

🔴 **Ce n'est pas un `production_container`.** Celui-là est le matériel du FOUR,
réglé par SKU — combien de pièces sur une tourneuse. Celui-ci est le contenant
d'expédition d'une commande. Même mot, deux objets, et la confusion mettrait un
réglage de four sur un bon de livraison.

Aucun auteur sur ce compte, et la commande n'en prend pas : ce n'est pas un fait
attesté comme une coche, c'est un état courant que le geste suivant écrase. Un
`staffSubject` que personne ne lisait a été retiré le jour même — un champ qu'une
règle reçoit sans jamais l'ouvrir laisse croire qu'il pèse.

### Le vocabulaire de l'écran

« Bac » a disparu de l'interface au profit de **commande** : c'est le bon qu'on
prépare, et le bac est devenu le container qu'on compte. Et « fermer » est
devenu **« déclarer prête »**, au mode d'acheminement près — « prête pour le
retrait » sur un `pickup`, « prête pour la livraison » sur une `delivery`.

⚠️ **Le serveur n'a pas suivi, et c'est délibéré.** Le fait reste
`OrderPackedEvent` — « colisé », ce que le fournil a fait — et le commerce en
tire `ready`, « prête pour le client ». Les deux sont distincts parce qu'un
colis fait n'est pas toujours remettable. L'écran nomme l'effet, le domaine
nomme le geste ; ne pas « aligner » l'un sur l'autre.

---

## Note — la contamination croisée, quand les containers seront nommés

_Idée posée le 2026-09-13, non implémentée. Écrite ici parce qu'elle change ce
que le container doit devenir, et qu'on le construit maintenant._

Les allergènes sont connus **par SKU** dans le référentiel. Le jour où l'on
posera chaque produit dans un container désigné, le poste pourra donc refuser —
ou au moins avertir — qu'on mette ensemble deux articles qui ne doivent pas se
toucher. C'est la seule place du système où la question se pose : c'est ici, et
nulle part ailleurs, que deux produits entrent physiquement dans la même boîte.

Trois choses à savoir avant de l'écrire :

**1. La règle est ASYMÉTRIQUE.** Ce n'est pas « ces deux-là sont
incompatibles ». C'est : un article **sans** un allergène doit être protégé de
celui qui **le porte**. Un sans-gluten ne voyage pas avec un pain ; le pain, lui,
ne risque rien. Modéliser ça comme une symétrie produirait des refus absurdes et
raterait le seul cas qui compte.

**2. 🔴 La production ne peut pas lire le référentiel.** `production → pim` est
interdit par la matrice des frontières, et le fournil ne connaît un SKU que
comme un **identifiant opaque**. Les allergènes devront donc arriver par un
**port que la production déclare** — `production/channels/…` — implémenté par
qui sait répondre, et relié dans `appBootstrap`. C'est exactement la figure de
`DayOrdersReader`. Aller les chercher en direct serait le raccourci qui défait
le chantier qui a créé ce schéma.

**3. Le moment de la lecture n'est pas neutre.** Tout ce que la production
garde d'une commande est un **snapshot** pris à la clôture. Un allergène est une
donnée réglementaire qui peut changer après ; refuser un colisage sur une copie
vieille de douze heures, ou l'autoriser sur une copie périmée, ne sont pas la
même faute. À trancher explicitement le jour venu — et à écrire, parce que ça ne
se devine pas en relisant le code.

**Conséquence immédiate, et c'est pourquoi cette note est ici** : le nombre de
containers ne restera pas un nombre. Il faut que la structure d'aujourd'hui
puisse devenir une liste de containers nommés, chacun portant ce qu'il contient
— sans quoi cette règle n'aura nulle part où s'appliquer.

---

> **Relecture multiposte** — depuis le 2026-09-14, ce poste se relit toutes les 15 s tant que l'onglet est visible, et une coche part directement au serveur, sans file. La règle et ses raisons : [`relecture-des-postes.md`](relecture-des-postes.md).

---

## L'écran n'additionne rien

_Décidé le 2026-09-14, à la demande de Hugo. État : en construction._

**Tout chiffre affiché dans les trois colonnes est calculé au serveur.** L'écran
affiche ce qu'il reçoit, et relit après chaque geste. Jusqu'ici il recalculait
lui-même le volume des commandes, les lignes dans le bac, les compteurs des
piles et — surtout — la marchandise à répartir, à chaque coche. Deux calculs du
même chiffre divergent à la première règle modifiée d'un seul côté, et c'était
précisément la balance qui en portait le risque.

Le contrat porte donc, par commande, `lineCount`, `packedLines`,
`remainingLines`, `pieces`, `packedPieces`, et la règle `canDeclareReady` ;
par journée, `orderCount`, `todoCount`, `readyCount`, et `relativeDay`
(« aujourd'hui » / « demain », selon l'horloge du **serveur** — celle d'un poste
de fournil n'est pas une autorité).

Hugo l'a dit en deux mots : **aucun calcul dans l'UI**. Les règles comptent
autant que les chiffres — un bouton « Déclarer prête » dont l'écran décide seul
s'il est actif est un calcul, et le jour où la règle change au serveur, l'écran
proposerait un geste que le serveur refuse. La marchandise (`produced`, `allocated`,
`remaining`) l'était déjà — l'écran cesse simplement de la refaire.

### Ce qui reste à l'écran

- **l'état d'une case le temps de l'envoi** : cochée tout de suite, désarmée,
  puis remplacée par ce que le serveur relit. Ce n'est pas un chiffre, et sans
  lui la case d'un `fold-checkbox` ne reviendrait pas en arrière sur un refus ;
- **le choix de ce qui est surligné** par la recherche : un filtre, pas un calcul.
- **« Masquer le stock épuisé »**, coché à l'ouverture. Le serveur dit quel
  article est épuisé (`exhausted`) ; l'écran masque, il ne compare pas le reste
  à zéro.

### Le stock épuisé se masque, le manque jamais

_Ajouté le 2026-09-14._ En cours de matinée, la plupart des articles de la
marchandise à répartir sont à zéro, et ce qui reste à répartir se perd entre
eux. `exhausted` vaut `true` quand le reste est **exactement** à zéro **et** que
l'article est sorti du four. Deux cas ne le sont jamais, et c'est la raison
d'en faire une règle serveur plutôt qu'un `remaining === 0` à l'écran :

- un reste **négatif** — il en manque, c'est ce que la colonne doit crier ;
- un article **en attente de la prod** — zéro sur ce qui n'est pas fabriqué
  n'est pas un stock épuisé.

Un article que la recherche surligne reste montré même épuisé : chercher un
produit et ne rien voir s'allumer ferait croire qu'il n'est dans aucune
commande. Quand le filtre masque tout, la colonne le dit — « Plus de marchandise
disponible » — plutôt que de laisser une liste vide. Le choix ne survit pas au
rechargement : c'est un réglage du poste, pas une donnée.

### Les containers se comptent au serveur

« + » et « − » envoient un **sens** (`POST …/containers/add` ou `/remove`), et
le serveur calcule le nouveau compte en une écriture atomique. Ce n'est pas
qu'un principe : un total envoyé par l'écran **perdait un container** dès que
deux postes appuyaient en même temps — chacun envoyait le même nombre.

La route `PUT …/containers` reste servie un déploiement de plus, dépréciée : elle
est en production (CLAUDE.md §0).

### La recherche ne fait plus de totaux

Elle affichait « en attend 24 » et « 3 commandes » — des sommes faites à la
frappe, donc par l'écran. Elle montre désormais **les quantités des lignes
trouvées**, qui sont des chiffres du serveur : on voit toujours qui attend
combien, sans qu'aucune addition ait lieu côté écran. Si ce recul devait
manquer, la suite serait une recherche au serveur, pas un retour du calcul à
l'écran.
