# La fiche d'atelier — ledger

Tenu **pendant**, pas après. Ce qui est fait, et surtout les surprises.

Plan : [`plan-fiche-atelier.md`](plan-fiche-atelier.md).
Dossier de reprise : `handoff-fiche-atelier/` (hors dépôt).

---

## 2026-09-13 — trois faits que le dossier de reprise ne pouvait pas voir

Le dossier décrivait un écran neuf et un endpoint neuf qui referait un
`groupBy` sur le récapitulatif du commerce. Une demi-journée de lecture du
dépôt a montré que les trois pièces existaient déjà, et mal branchées.

### La table existait

`production.ProductionCount` — « un article, une quantité, tous clients
confondus » — **est** la fiche d'atelier. Le `groupBy` proposé aurait été une
seconde agrégation du même fait, donc une seconde occasion de diverger de la
première.

### L'heure de tirage existait

La SPEC affirme que « l'heure de tirage manque partout ». C'est vrai des deux
documents qu'elle cite, et faux du compte à produire : `ProductionDay.closedAt`
EST l'instant où le tirage a été arrêté, et `AtelierSheet.issuedAt` porte déjà
celui de chaque feuille. Il n'y avait rien à inventer, seulement une heure à
afficher.

### 🔴 Mais personne ne clôt jamais une journée

`POST /admin/production/batch/:date/close` n'a **aucun appelant** hors des
e2e — ni dans l'admin, ni dans la boutique. La route est servie, le handler est
testé, l'agrégat est juste : et le geste n'existe nulle part dans une interface.

Conséquence immédiate : le compte à produire est **vide en exploitation**, et le
serait resté sous la fiche. On aurait livré un écran parfaitement conforme à sa
maquette, et vide tous les matins.

C'est le fait le plus lourd du lot, et c'est celui qu'aucune relecture de plan
n'aurait produit : il ne se voit pas en lisant le code de la production, qui est
complet. Il se voit en cherchant **qui l'appelle**.

## Ce que ça a changé dans la conception

La fiche **arbitre deux sources**, exactement comme le prévisionnel le fait
déjà : le compte arrêté l'emporte, la demande du commerce sinon. Deux écrans du
même fournil qui trancheraient différemment afficheraient deux vérités le même
matin — et c'est celui qui pétrit qui arbitrerait.

Une journée ouverte rend donc `generatedAt: null`, et l'écran **dit** que le
plan n'est pas arrêté. Écrire l'heure de la lecture aurait été le piège : une
fiche qui porte une heure passe pour un tirage, et deux personnes croiraient
lire le même papier en en lisant deux.

## Le bandeau ne se calcule pas, il se lit

La clôture fait quitter `placed` aux commandes ; les ports du commerce ne
rendent que `placed`. Ce qui reste `placed` après une clôture est donc
exactement ce qui est arrivé depuis le tirage — le `+18`, les lignes nommées,
les « 14 commandes arrivées depuis ».

⚠️ **Avec un filtre par `orderId`, ajouté au plan après coup.** La clôture
publie son fait par un bus **en processus, ni persisté ni rejoué** : un abonné
en échec laisse des commandes `placed` **déjà inscrites au plan** (c'est ce que
`pendingInCommerce` mesure). Sans le filtre, la fiche aurait annoncé un écart
qui n'existe pas et compté deux fois des pièces déjà au compte.

Le filtre a une seconde vertu, trouvée en l'écrivant : le bandeau annonce alors
**exactement** ce que le bouton absorbera, puisque le retirage écarte les mêmes
`orderId`. Le chiffre affiché et le geste proposé ne peuvent plus diverger.

## L'invariant qu'on a nommé plutôt que levé

L'agrégat dit depuis toujours : _une journée arrêtée ne se recalcule pas_. La
maquette demande pourtant « Retirer la fiche de 6 h 20 ».

Ce n'est pas la même chose, et toute la conception tient dans cette différence :
un **recalcul silencieux** contre un **geste attesté**, fait par quelqu'un à qui
l'écran vient de montrer les deux lignes qui changent et de dire laquelle est
déjà cochée. D'où `retakenBy` — sans auteur, ce serait exactement le recalcul
qu'on refuse.

Les coches survivent au retirage, par SKU. Le pain sorti du four à 5 h l'est
toujours quand la quantité passe de 30 à 42 : les perdre ferait refabriquer ce
qui est fait. Ce qui reste dangereux — une ligne cochée sur une quantité qui a
monté — est précisément ce que le bandeau nomme AVANT de proposer le geste.

## Un type qui servait à deux questions

Le typecheck a refusé la coche, et il avait raison : `ProducedItemSnapshot`
servait au compte à produire **et** aux colonnes du prévisionnel. Depuis qu'il
porte la coche, il dit deux choses — ce qu'il y a à fabriquer, et ce qui est
déjà sorti — et le prévisionnel ne sait rien de la seconde.

Le réflexe aurait été d'ajouter `done: null` dans les lectures du prévisionnel.
C'était inventer « pas fait » pour des journées qui n'ont même pas de tirage.
Le mur de planning a désormais son `DemandItem`, et c'est un resserrement, pas
une duplication.

## Les écarts assumés avec la maquette

Trois, et aucun n'est comblable sans fabriquer une donnée :

- **cinq catégories, pas six.** L'onglet « Boissons — sans four » n'a aucun
  équivalent réel, et rien ne permet de déduire qu'une catégorie ne passe pas au
  four. Un champ que personne ne peut renseigner est une mesure fabriquée ;
- **pas de « +2 de casse ».** Aucune table ne porte de taux de casse, et un
  nombre inventé pour remplir un dessin devient un nombre que quelqu'un finit
  par citer au téléphone ;
- **l'ordre est la quantité décroissante, pas celui des cuissons.** C'est le
  bon ordre qui manque, et le dossier de reprise le dit lui-même : c'est la
  seule donnée absente des trois vues.

Et un quatrième écart, décidé par le commanditaire : **pas de feuille A4**. Les
bons de commande tiennent déjà le papier.

---

## 2026-09-13, plus tard — trois décisions du commanditaire

Elles arrivent après la première livraison, et deux d'entre elles **inversent**
le dossier de reprise. Elles sont écrites ici parce qu'un jour quelqu'un
comparera l'écran à la maquette et croira à une dérive.

### Le geste d'arrêt est allé au prévisionnel, pas à la fiche

Le plan proposait de poser « Arrêter le plan du soir » dans la fiche, faute
d'endroit. Le bon endroit était le prévisionnel : c'est le seul écran où l'on
regarde une journée en se demandant si elle est complète, et il sait déjà,
colonne par colonne, laquelle est arrêtée.

La bande vise **la journée ouverte la plus proche qui porte des commandes** —
et jamais une journée vide, que la clôture refuserait : proposer un bouton qui
mène à un refus envoie chercher une panne qui n'existe pas.

Elle a coûté une correction de JSDoc. Le prévisionnel affirmait « aucune
saisie : le prévisionnel lit, il ne corrige pas ». C'est toujours vrai, et la
distinction est tout le sujet : arrêter ne corrige aucun chiffre, il décide
qu'une colonne cesse d'être une prévision pour devenir un fait.

### Le dossier du jour a suivi

Décidé dans la foulée : le récapitulatif, les bons de commande et leur
impression quittent la fournée du jour pour le prévisionnel — **le même geste
du soir**, arrêter le plan et tirer le dossier.

La fournée du jour devient donc la fiche d'atelier **seule**, sans bascule à
trois vues. Ce qui déménage est du back-office en service : ce dossier part au
fournil sur papier tous les jours, et rien de ce qui le rend dénombrable — le
lot compté, les rangs, l'ordre stable du tirage, les deux vues gardées dans le
DOM pour que l'impression sorte le dossier entier — ne doit se perdre au
passage.

### 🔴 La palette de l'établi est abandonnée

La maquette posait une palette à elle — papier crème, encre presque noire, or —
et la SPEC la justifiait : « c'est l'établi, pas le chrome de l'app ». Décision
contraire du commanditaire : la fiche prend les rôles `--fold-*` du thème
`navi`, comme le reste du back-office, et occupe la **pleine hauteur**.

Ce qu'on gagne : un back-office qui ne se dédouble pas.

Ce qu'on perd, et il faut l'écrire pendant qu'on le sait : cette palette n'était
pas un goût, c'était une réponse à une distance de lecture d'un mètre et à des
mains farinées. Ce qui doit survivre au changement de thème est donc la
**structure** — la colonne de gauche qui ne bouge d'aucun support (case,
quantité en chiffres monospacés alignés à droite, nom), les tailles de lecture,
la ligne faite barrée et éteinte. Si un jour la fiche redevient illisible au
four, c'est ici qu'il faut revenir : le thème n'est pas en cause, la structure
l'est.

### Les initiales viennent de la personne

Confirmé : elles sont déduites du prénom et du nom de qui est connecté, et non
saisies à chaque ligne. On ne tape pas deux lettres neuf fois avec les doigts
dans la farine.

⚠️ Ce que ça suppose : au fournil, on signe **en son nom**, pas au nom du
poste. Le jour où un téléphone reste sur le pétrin avec une session partagée,
toutes les lignes porteront les mêmes initiales — et elles seront vraies au
regard du compte, fausses au regard de qui a enfourné.

## Ce qui manque encore, et qui ne s'invente pas

- **L'heure de la version disponible.** La maquette oppose « version de 6 h 20 »
  au « tirage de 4 h 05 ». `WorkshopDrift` ne porte aucun instant : le seul
  qu'on ait est celui du tirage. Le bandeau dit donc « +18 pièces sur 2 lignes
  depuis le tirage de 4 h 05 ». Si l'autre heure compte, c'est un champ à
  ajouter au contrat — pas une valeur à fabriquer à l'écran.
- **Les pastilles « poste isolé » et « sur commande »**, et la qualification de
  poste (« four à sole · pétri dès 4 h »). Rien ne les porte.
- **Le contenant** n'a pas encore d'écran de réglage, donc la colonne de droite
  reste vide en pratique. L'emplacement est une question ouverte : le fichier de
  routes des Réglages dit lui-même « on ne va pas dans les réglages pour
  travailler », ce qui plaide pour le régler **dans la fiche**, là où l'on
  constate qu'il manque.
