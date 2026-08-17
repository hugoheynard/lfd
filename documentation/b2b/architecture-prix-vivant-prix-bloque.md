# Qui porte le risque ? — **prix vivant** et **prix bloqué**

**État : 🔵 note de conception, ZÉRO code.** Écrite le 2026-08-17, après la
livraison du plancher à deux étages. Rien de ce qui suit n'est implémenté ; ce
document sert à trancher avant de coder, parce que le choix engage la façon dont
un prix se résout et dont une commande se relit.

Voisins :

- [`architecture-resolution-de-prix.md`](architecture-resolution-de-prix.md) —
  les étages, le plancher, l'élasticité. **Ce document ne les rediscute pas** :
  il ajoute une question que ce modèle ne posait pas, celle de savoir **qui
  subit** un changement de prix ;
- [`architecture-commande-immuable-avenants.md`](architecture-commande-immuable-avenants.md)
  — une commande est un fait clos. C'est de là que vient le gel du prix à la
  passation, et c'est ce gel que le prix bloqué étend à toute une saison.

---

## Le problème, en une phrase

Le modèle actuel sait dire **combien** coûte un article. Il ne sait pas dire
**qui encaisse la variation** quand le coût de la maison bouge.

Aujourd'hui, quand les overheads montent en cours de saison — la farine, le
beurre, l'électricité du fournil, un salaire de plus — on relève le tarif de
liste et **tous les clients le subissent au même instant**. C'est le seul
comportement possible, faute d'avoir jamais nommé l'autre.

L'autre existe pourtant, et il est courant.

---

## L'analogie qui rend le sujet lisible : le contrat brasseur

Un brasseur vend sa bière de deux façons, et tout le métier tient dans l'écart
entre les deux.

**Le café qui achète au coup par coup.** Il commande ce qu'il veut, quand il
veut, au tarif du jour. Le brasseur augmente en mars ? Le café paie le nouveau
prix dès la commande suivante. Liberté totale des deux côtés, et **c'est
l'acheteur qui porte le risque de prix**.

**Le café sous contrat de volume.** Il s'engage sur 40 hectolitres sur douze
mois, à un prix arrêté à la signature. Le brasseur augmente en mars ? Ce
café-là ne bouge pas : il a **acheté la stabilité**, et il l'a payée en
s'engageant sur un volume. Si les cours du malt s'envolent, **c'est le brasseur
qui porte le risque** — et il l'accepte parce que le volume garanti absorbe ses
frais fixes.

Le second contrat n'est pas une faveur : c'est un **échange de risques**. Le
client échange sa liberté de volume contre une garantie de prix ; le brasseur
échange sa liberté de prix contre une garantie de volume.

Une boulangerie qui livre des hôtels de station est exactement dans cette
position. Un hôtel qui prend 300 viennoiseries tous les matins de décembre à
avril **veut** un prix ferme pour construire son budget. Un restaurant qui
commande au gré de son taux de remplissage **veut** le tarif du jour et aucune
obligation.

---

## Un mot sur le nom

Ces deux chemins se sont d'abord appelés « vendor lock » et « buyer lock ». Le
nom a été abandonné pour une raison qui n'est pas cosmétique : en informatique,
_vendor lock-in_ désigne le **client** prisonnier de son fournisseur — soit
exactement l'inverse de ce que « vendor lock » voulait dire ici. Un vocabulaire
qui piège son lecteur au premier contact ne survit pas à la personne qui l'a
inventé.

**Prix vivant** et **prix bloqué** disent ce qui se passe, dans la langue de
celui qui vend, et ne demandent aucune glose.

---

## Les deux chemins

### Le prix vivant — il suit la maison

Le client est sur le **tarif vivant**. Toute évolution décidée ici — hausse
d'inter-saison, ajustement d'overheads en cours de saison — s'applique à lui dès
sa commande suivante.

- Aucun engagement de volume de sa part.
- Aucune garantie de prix de la nôtre.

|     | Ce que ça donne                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅  | **Le client assume la hausse.** Le coût qui monte est répercuté, la marge tient.                                                                                            |
| ⚠️  | **Risque de baisse de volume.** Rien ne le retient : il peut commander moins, décaler, ou aller voir ailleurs — et c'est exactement au moment où on augmente qu'il y pense. |

Le risque n'a donc pas disparu, il a **changé de nature** : on ne porte plus le
risque de prix, on porte le risque de volume. Et le second est plus difficile à
voir venir que le premier — une hausse se décide, une désaffection se constate.

C'est le comportement actuel de la plateforme, et il reste le **défaut**. Le
nommer ne change rien à son fonctionnement ; ça permet seulement de dire ce
qu'il est quand l'autre existera à côté.

### Le prix bloqué — le volume achète la stabilité

Le client **bloque un volume sur une durée déterminée**. En échange, son prix
d'entrée est figé pour toute la durée : les hausses de tarif de liste ne
l'atteignent pas.

- Engagement de volume de sa part.
- Prix d'entrée garanti de la nôtre.

|     | Ce que ça donne                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅  | **Le volume est acquis.** Il ne dépend plus de l'humeur d'une saison, et il absorbe les frais fixes.                                                           |
| ⚠️  | **La hausse est pour nous.** Et le volume d'un seul client peut ne pas suffire à l'absorber — voir plus bas, c'est le point qui décide de la façon de mesurer. |

C'est le contrat brasseur, et c'est un objet nouveau dans le modèle : ni une
mercuriale (qui est un prix négocié mais **sans** engagement de volume ni terme
garanti), ni un panier récurrent (qui dit _quoi_ commander, jamais _combien ça
coûte_ — cf. la décision du 2026-08-17 sur les gabarits).

---

## Ce que ça change dans la résolution de prix

**Le prix bloqué agit à l'ENTRÉE du pipeline, pas comme un étage de plus.**

C'est le point qui décide de tout le reste. Un engagement ne remise pas : il
**remplace le prix canonique** par celui qui a été arrêté à la signature, et
laisse le reste de la chaîne se dérouler normalement.

```
Vivant  :  prix canonique DU JOUR    → mercuriale → volume → promo → geste → plancher
Bloqué  :  prix canonique DU CONTRAT → mercuriale → volume → promo → geste → plancher
                        ▲
                        └── figé à la signature, insensible aux hausses de liste
```

Deux conséquences qu'il faut assumer avant d'écrire une ligne :

**Les promotions restent activables sur le chemin bloqué.** C'est explicitement
voulu : un client engagé n'est pas exclu des opérations commerciales. Mais comme
sa base est plus ancienne — donc, en régime d'inflation, **plus basse** — une
même promotion lui donne un prix mécaniquement inférieur à celui d'un client au
prix vivant. C'est l'objet de l'indicateur ci-dessous.

**Le plancher, lui, reste calculé sur le canonique du contrat.** Un plancher
exprimé en fraction (« jamais sous 50 % du tarif ») suivrait sinon le tarif de
liste et remonterait sous un prix contractuel figé — ce qui reviendrait à
reprendre d'une main la garantie donnée de l'autre.

---

## Mesurer le MODÈLE, pas le client

**Le volume d'un client ne suffit pas toujours à absorber la hausse, et ce n'est
pas un échec.** Un hôtel engagé sur 300 viennoiseries par jour couvre une part
des frais fixes de la saison ; il ne couvre pas, à lui seul, une envolée du
beurre. Regarder son contrat isolément le fera toujours apparaître comme une
perte dès que les coûts montent.

Juger client par client tuerait donc l'instrument : chaque contrat pris seul
paraîtrait mauvais exactement quand le dispositif entier fonctionne.

**La performance du prix bloqué se mesure sur la POPULATION des adoptants**, en
moyenne, sur la période :

```
absorbé   = Σ ( volume livré à prix bloqué × (tarif vivant du jour − prix bloqué) )
apporté   = Σ ( volume livré à prix bloqué )            ← le volume qu'on n'aurait pas eu
équilibre = apporté couvre-t-il l'absorbé ?
```

Trois conséquences, et ce sont elles qui rendent le chiffre utile :

- **Un contrat déficitaire n'est pas un mauvais contrat.** Il l'est seulement si
  la moyenne de la cohorte l'est aussi. Le tableau doit donc afficher la
  moyenne AVANT le détail, sinon on résiliera le mauvais.
- **Le seuil est un signal d'arrêt, pas de résiliation.** Quand la cohorte passe
  sous l'équilibre, ce qu'on arrête, c'est de **signer de nouveaux contrats au
  prix actuel** — pas d'honorer ceux qui existent. Les honorer est précisément ce
  qu'on a vendu.
- **La cohorte se renouvelle par le bas.** Chaque nouveau contrat se signe au
  tarif du jour, donc plus haut ; la moyenne remonte d'elle-même à mesure que les
  anciens arrivent à terme. Un modèle qui ne se renouvellerait pas dériverait
  jusqu'à devenir une remise permanente que personne n'a décidée.

**Ce que ça implique pour l'écran** : l'unité d'affichage du prix bloqué n'est
pas la fiche client, c'est la **cohorte**. La fiche client montre un engagement ;
seul le tableau de bord dit si le dispositif tient.

---

## Le prix et le territoire

**Le canonique peut s'adapter au marché local**, par zone de code postal. Val
d'Isère en février et une vallée à vingt kilomètres ne sont pas le même marché :
ni la même concurrence, ni la même disposition à payer, ni le même service.

La zone existe déjà dans le modèle (`DeliveryZone`, une liste de préfixes
postaux) et elle a une propriété précieuse : elle se **déduit de l'adresse
livrée**, elle ne se choisit pas. Personne ne peut donc s'annoncer dans un
secteur moins cher que le sien.

### Deux justifications à ne surtout pas confondre

La zone porte **déjà** un frais de livraison. Si le canonique varie aussi par
zone, la même réalité géographique est tarifée deux fois — et le client qui
compare le verra.

| Instrument          | Ce qu'il couvre                                          |
| ------------------- | -------------------------------------------------------- |
| **Frais de zone**   | le **coût** : la distance, le temps de tournée           |
| **Canonique local** | le **marché** : la concurrence, ce que la place supporte |

Écrire cette distinction n'est pas une précaution de style : c'est ce qui permet
à un commercial de **justifier** l'écart au téléphone. « Vous êtes plus loin »
explique un frais. Ça n'explique pas un tarif de base plus élevé — et si personne
ne sait dire ce qui l'explique, il ne faut pas le poser.

### Où ça s'insère

**À l'entrée du pipeline, exactement comme le prix bloqué.** Le canonique local
remplace le canonique national, et toute la chaîne se déroule ensuite sans
changement. Aucun étage de plus, aucune spécificité nouvelle à arbitrer.

Une conséquence à trancher : **quand un client a un prix bloqué ET livre dans une
zone adaptée, lequel gagne ?** Le contrat, sans hésiter. Sinon un client
changerait d'adresse de livraison et casserait sa propre garantie — ou pire,
irait chercher la zone qui l'arrange.

---

## La coopérative d'acheteurs

**Le palier se mesure sur la ZONE, pas sur le client.** Les acheteurs d'un même
secteur mettent leur volume en commun ; le total du secteur ouvre un tarif
meilleur pour tous ceux qui s'y trouvent.

### Pourquoi la zone est une cohorte légitime

Ce n'est pas un regroupement arbitraire. **La tournée est l'unité réelle du
coût** : un camion, un chauffeur, une matinée. Deux clients sur la même tournée
coûtent réellement moins cher chacun que deux clients sur deux tournées. Le
partage n'est donc pas une fiction commerciale, il correspond à une économie qui
existe.

C'est aussi la réponse, à une granularité qui a un sens physique, au problème
posé plus haut : le volume d'**un** client ne suffit pas à absorber une hausse,
celui d'un **secteur** peut y arriver.

### La dynamique : le client devient prescripteur

Chaque acheteur a intérêt à ce que son voisin commande — ça fait monter le
palier commun, donc baisser son propre prix. La clientèle installée devient une
force de prospection qu'on n'a pas à payer, et elle prospecte exactement là où
la tournée passe déjà.

C'est le seul mécanisme de cette page qui **crée** du volume au lieu de le
constater.

### Ce qu'il faut trancher avant de coder

**Un palier acquis se perd-il en cours de période ?** Si un membre part et fait
retomber le secteur sous le seuil, il ne faut pas que les autres soient punis
pour être restés. Direction à privilégier : le palier est **acquis pour la
période en cours**, et se réévalue à la suivante — même principe que la décision
de plancher figée à la passation.

**Le retardataire profite sans avoir construit — et c'est voulu.** Celui qui
rejoint un secteur déjà au bon palier en bénéficie immédiatement. C'est
exactement l'incitation qu'on cherche : ce serait un mauvais calcul de la
retirer pour une question d'équité qui n'intéresse personne.

**Et si la zone n'a qu'un seul acheteur ?** Le mécanisme devient une remise
individuelle déguisée en coopérative. Il faut soit un nombre minimum de membres,
soit accepter d'y voir un cas particulier — et le dire.

---

## L'indicateur qui décide d'activer une promo

La question opérationnelle est : **« est-ce que j'active cette promo pour les
clients au prix bloqué ? »**

Elle ne se répond pas au feeling, parce que les deux populations ne partent pas
du même prix. Il faut donc, par article et par promotion candidate, montrer
**trois nombres et un écart** :

| Ce qu'on montre             | Ce que ça dit                                      |
| --------------------------- | -------------------------------------------------- |
| Prix vivant **après** promo | ce que paie un client au tarif du jour             |
| Prix bloqué **après** promo | ce que paierait un client engagé                   |
| **Écart** bloqué vs vivant  | de combien l'engagement est déjà en dessous        |
| Écart **sans** la promo     | ce que l'engagement valait déjà, avant d'y toucher |

La lecture attendue, et la seule qui compte :

> Si le client au prix bloqué est **déjà** sous le prix vivant promotionné, la
> promo ne lui est pas nécessaire — elle offrirait une remise à quelqu'un qui a
> déjà obtenu sa remise en s'engageant. L'activer reviendrait à le payer deux
> fois pour le même engagement.

À l'inverse, si l'inflation a été faible depuis la signature, l'écart est mince
et la promo garde son sens sur les deux chemins.

**Ce dont cet indicateur a besoin et qui existe déjà** : la fonction pure de
résolution, appelable avec deux bases différentes sans rien dupliquer. C'est
précisément ce que `resolvePrice(canonicalCents, …)` permet — il suffit de
l'appeler deux fois.

---

## Ce qu'il faudra trancher avant de coder

Ces questions sont **ouvertes**. Les noter empêche de les décider par accident,
au détour d'une implémentation.

**Que se passe-t-il quand le volume engagé n'est pas atteint ?** Trois réponses
possibles, très différentes : rien (le contrat est une garantie unilatérale), une
régularisation au prix vivant sur l'écart, ou la perte du prix figé pour les
commandes suivantes. Le contrat brasseur réel choisit en général la deuxième —
et c'est aussi la plus lourde à implémenter, parce qu'elle rouvre des commandes
closes. _Voir plus bas : c'est le vrai piège du modèle._

**Le volume engagé se mesure sur quoi ?** Un total en unités toutes références
confondues, ou un engagement par référence ? Un hôtel qui promet « 300
viennoiseries par jour » ne promet pas 300 croissants.

**Que devient un contrat en cours quand le client veut le renégocier ?** Un
avenant qui remplace, ou un second contrat qui se superpose ? Le modèle de
commande a déjà tranché « fait clos + avenant » — la cohérence pousse vers
l'avenant.

**Un contrat peut-il couvrir une partie du catalogue seulement ?** Presque
certainement oui (« la viennoiserie oui, la pâtisserie non »), ce qui en fait un
objet **scopé** — et la portée est déjà un vocabulaire du contexte prix.

---

## Le piège à ne pas reproduire

Le plancher dynamique, livré ce matin, a failli introduire un prix qui **dépend
de l'historique** — donc un prix qu'on ne peut plus expliquer dès que
l'historique bouge. Il n'est acceptable que parce que la décision est **figée
sur la ligne** au moment où elle a compté.

Le prix bloqué présente exactement le même danger, en plus gros : si la
régularisation « volume non atteint » recalcule le prix de commandes déjà
facturées, alors **une commande close cesse d'être close**. Le modèle entier
repose sur le contraire.

La direction à privilégier, si la régularisation est retenue : ne jamais toucher
aux commandes passées, et émettre un **document de régularisation distinct** à
l'échéance du contrat. C'est plus de travail, et c'est la seule forme qui laisse
une facture relisible six mois plus tard.

---

## Ce que ce document ne dit pas

Il ne propose **aucun schéma de table**, volontairement. Le premier réflexe
serait d'ajouter un `contract_type` sur `Company` — et ce serait faux : un même
client peut être sous contrat sur une famille et au tarif du jour sur une autre,
et un contrat a une durée qu'un champ sur la société ne saurait pas porter.

L'objet à modéliser est **l'engagement**, pas le client.
