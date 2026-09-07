# Les pièces d'un client dans R2 — ce qu'on range, et où

**Ouvert le 2026-09-07.** Le bucket `customers` existe et sert déjà les bons de
commande ; **`production` est décidé et reste à créer**. Ce document dit comment
les deux sont organisés, et ce qui viendra s'y ajouter — l'écrire avant que le comptable dépose sa première facture coûte une
page ; l'écrire après coûte une migration de fichiers.

---

## 1. Trois buckets, et la ligne qui les sépare

| Bucket       | Ce qu'il contient                    | Ce qu'il est                       | Public ?                | État |
| ------------ | ------------------------------------ | ---------------------------------- | ----------------------- | ---- |
| `kbis`       | extrait de greffe, mandat signé      | ce que le client **nous donne**    | non                     | ✅   |
| `customers`  | bon de commande, facture             | ce qu'il peut nous **opposer**     | **non**                 | ✅   |
| `production` | compte à produire, feuille d'atelier | ce qui documente **notre travail** | **non**                 | ⛔   |
| `media`      | visuels du catalogue                 | la vitrine                         | **oui**, par un domaine | ✅   |

La séparation n'est pas du rangement. La configuration le dit en une phrase :

> « Chaque usage porte son bucket **et ses clés** : un jeton n'ouvre que le
> sien. »

### La ligne de partage : **opposable** contre **opérationnel**

C'est le critère, et il n'est pas « client contre production » :

|                    | `customers`                         | `production`                         |
| ------------------ | ----------------------------------- | ------------------------------------ |
| Contenu            | bon de commande, facture            | compte à produire, feuille d'atelier |
| Durée de vie       | des **années** — question comptable | des **semaines**                     |
| Porte des montants | oui                                 | **jamais**, par construction         |
| Qui doit lire      | le client, via l'API                | le fournil                           |

Le troisième critère est le plus parlant. La feuille d'atelier n'a **aucun champ
monétaire** — c'est une propriété de son type. Le jour où une borne au fournil ou
un service d'impression doit lire des documents, lui donner le jeton `customers`
lui donnerait aussi **toutes les factures**. La règle qu'on applique déjà — « un
jeton n'ouvre que le sien » — dit qu'il faut couper là.

⚠️ **Ce document a d'abord défendu un bucket unique, et l'argument était
faux.** Il disait : « une règle de rétention devrait être posée deux fois, à deux
endroits qui finiraient par diverger ». C'est à l'envers — ces pièces n'ont pas
la même durée de vie, donc les deux règles **doivent** diverger. Le vrai risque
d'un bucket unique est l'inverse : il **force** une règle unique sur des pièces
qui n'en veulent pas la même.

Le second argument — « tout ce qui concerne la commande X est en X » — ne servait
personne : l'API résout des clés, personne ne parcourt un bucket à la main.

🔴 **Le KBIS reste dehors**, bien qu'il appartienne aussi à un client. Il a son
bucket depuis plus longtemps, **avec des données dedans** : l'y ranger serait une
migration de fichiers, pas un renommage. C'est exactement pourquoi ce découpage
se décide **maintenant** — rien n'est déployé, aucun octet n'existe, et le
changement coûte trois variables d'environnement.

⚠️ **`customers` ne doit jamais être servi par un domaine.** C'est la différence
avec `media`, et elle est structurante : une adresse publique rendrait la facture
d'un client lisible par qui devine une clé. Ces pièces passent par l'API,
derrière le mur de la société.

---

## 2. L'arborescence

```
customers/                                  ✅ existe
├── orders/{orderId}/
│   ├── bon-de-commande-r{revision}.pdf     le client — montants, sans QR
│   └── bon-staff-r{revision}.pdf           le bureau — SKU, trace du prix
└── companies/{companyId}/invoices/{AAAA-MM}/
    └── facture-{numero}.pdf                déposée par le comptable

production/                                 ⛔ à créer
├── {AAAA-MM-JJ}/
│   └── compte-a-produire.pdf               le récapitulatif du jour
└── orders/{orderId}/
    └── fiche-atelier-r{revision}.pdf       le fournil — sans montants
```

### Le préfixe reste `orders/{orderId}/` des deux côtés

Deux buckets, mais le **même préfixe** : les papiers d'une commande se retrouvent
sous son identifiant, où qu'ils vivent. Ce qui protège un client d'un autre n'est
pas le bucket — c'est ce **préfixe de clé**, dérivé d'identifiants déjà vérifiés,
et le mur de la société côté API. Le bucket, lui, sépare des **durées de vie** et
des **jetons**.

### La question qui simplifierait tout : faut-il archiver la feuille d'atelier ?

Elle est **déterministe** : elle se refabrique à l'identique tant que la commande
n'a pas bougé. Le seul besoin d'en garder une copie est de répondre à « quelle
feuille est partie au fournil ce matin-là » **après un avenant** — et l'avenant
n'existe pas.

Si on ne l'archive pas, `production` ne contient plus qu'**une** pièce : le
compte à produire. Et celle-là, il faut la garder — c'est un instantané arrêté à
la clôture, et les commandes bougent après ; on ne la refabrique pas.

À trancher avant d'écrire le bucket, pas après.

### Pourquoi la révision est dans le nom de fichier

Le port du stockage le dit : « une même clé écrase — c'est ce qui fait qu'un
remplacement reste un remplacement ». Un chemin sans révision ferait donc
disparaître, au premier avenant, le PDF qui circule déjà — **le seul document que
le client peut opposer**.

Chaque révision garde le sien. L'écran propose la dernière ; l'historique reste
lisible.

---

## 3. Ce qui s'y range, pièce par pièce

| Pièce                      | Bucket       | Clé                                           | Qui l'écrit      | Quand                                  | État |
| -------------------------- | ------------ | --------------------------------------------- | ---------------- | -------------------------------------- | ---- |
| **Bon de commande** client | `customers`  | `orders/{id}/bon-de-commande-r{n}.pdf`        | l'API            | au 1ᵉʳ téléchargement                  | ✅   |
| **Bon staff**              | `customers`  | `orders/{id}/bon-staff-r{n}.pdf`              | l'API            | au 1ᵉʳ téléchargement                  | ⛔   |
| **Facture**                | `customers`  | `companies/{id}/invoices/{mois}/facture-…pdf` | **le comptable** | au dépôt                               | ⛔   |
| **Compte à produire**      | `production` | `{jour}/compte-a-produire.pdf`                | l'API            | à la clôture du plan du soir           | ⛔   |
| **Fiche d'atelier**        | `production` | `orders/{id}/fiche-atelier-r{n}.pdf`          | l'API            | au tirage du lot — **si on l'archive** | ⛔   |

### Le bon de commande — le seul livré

Écrit au **premier téléchargement**, pas à la passation : l'immense majorité des
commandes ne verra jamais son PDF demandé.

⚠️ **Ce pari tombe le jour où le courriel de confirmation joint le bon**, ce qui
est l'étape suivante. On passera d'une fraction des commandes à leur totalité —
et c'est ce qui rend la question de la conservation pressante
([`../todos/todo-conservation-des-bons-en-r2.md`](../todos/todo-conservation-des-bons-en-r2.md)).

La course entre deux téléchargements simultanés est **inoffensive**, et pour une
raison qui vaut pour tout ce document : le rendu est **déterministe**. Deux
écritures produisent des octets identiques, la seconde écrase la première par le
même objet, et peu importe qui gagne. Ni verrou, ni réservation.

### La fiche d'atelier — ce que le rangement change

Elle est **tirée à la demande** aujourd'hui, et rien n'en garde de copie. La
ranger répond à une question qu'on ne peut pas poser actuellement : _quelle
feuille est partie au fournil ce matin-là ?_ Après un avenant, deux versions
circulent, et le papier lui-même porte sa révision — mais rien ne permet de
retrouver la première.

### Le compte à produire — la seule pièce qui n'est pas par commande

C'est le récapitulatif d'une **journée** : combien de croissants, combien de
traditions, tous clients confondus. Il n'appartient à aucune commande, d'où son
préfixe à part.

Il se range à la **clôture du plan du soir** — le moment où la journée bascule,
et donc le seul instant où le compte est arrêté. Le tirer plus tard donnerait un
autre nombre.

⚠️ **Il ne porte aucun nom de client.** C'est un compte de matière, pas une
liste de commandes ; le fournil s'en sert pour lancer des fournées, pas pour
préparer des sacs. La feuille par commande, elle, nomme le client — les deux ne
se remplacent pas.

### La facture — la seule que nous n'écrivons pas

C'est la pièce qui change la nature du bucket, et il faut le dire franchement :
**la plateforme n'émet pas de facture**, et
[`order-documents.ts`](../../packages/b2b-ui/src/order/order-documents.ts) la
déclare indisponible pour une raison qui ne bouge pas :

> « Une facture porte un numéro dans une série continue et des mentions légales.
> Aucune numérotation n'existe côté serveur ; en fabriquer une dans le navigateur
> produirait un document sans valeur que quelqu'un finirait par envoyer à son
> comptable. »

Elle sera donc **déposée**, pas générée : le comptable la produit dans son outil
et la verse ici. Trois conséquences, qui ne sont pas les mêmes que pour les
pièces qu'on fabrique :

1. **Elle n'est pas déterministe** — elle ne se refabrique pas. Perdre le fichier
   perd la pièce, ce qui n'est vrai d'aucune autre entrée de ce tableau.
2. **Elle est rangée par SOCIÉTÉ et par MOIS**, pas par commande : une facture
   couvre un relevé, pas un achat.
3. **Elle porte un numéro de série**, qui devra vivre en base — pas seulement
   dans un nom de fichier, qu'on peut renommer.

Le chantier est ailleurs :
[`../b2b/architecture-facturation.md`](../b2b/architecture-facturation.md).

---

## 4. Deux règles qui valent pour tout ce bucket

**La clé ne vient jamais du client.** Elle se dérive d'identifiants déjà
vérifiés — `orderId` après le mur de la commande, `companyId` après le mur de la
société. C'est ce que le port impose, et c'est le mur de tenancy du stockage : il
est **dans le chemin**.

**Ce qui est archivé ne se réécrit pas.** Un avenant ajoute une révision ; il
n'écrase rien. C'est la propriété qui fait qu'un client peut opposer un document,
et c'est aussi celle qui fait croître le stockage sans fin — d'où le TODO de
conservation, dont la réponse sera **comptable avant d'être technique**.

---

## 5. Ce que ce document ne dit pas

- **Combien de temps on garde** :
  [`../todos/todo-conservation-des-bons-en-r2.md`](../todos/todo-conservation-des-bons-en-r2.md).
- **Ce que contient chaque pièce**, audience par audience :
  [`architecture-bon-de-commande.md`](architecture-bon-de-commande.md).
- **Comment une facture est émise** :
  [`../b2b/architecture-facturation.md`](../b2b/architecture-facturation.md).
