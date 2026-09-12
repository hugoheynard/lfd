# La RUM — la référence unique de mandat

**La chaîne que le débiteur oppose à sa banque**, avec notre ICS, pour autoriser
ou bloquer un prélèvement. Elle est imprimée sur le papier qu'il signe et
apparaît sur son relevé.

> **Document à part, ouvert le 2026-09-12.** La RUM a sa propre doc parce
> qu'elle a ses propres contraintes — une borne de 35 caractères, un jeu de
> caractères restreint, et une question de sécurité qui ne ressemble à aucune
> autre du dépôt. Noyée dans le document du prélèvement, elle se relisait au
> milieu de trente autres sujets.
>
> Le contexte général — le schéma SDD B2B, le lot, l'état des lieux — vit dans
> [`prelevement-sepa.md`](prelevement-sepa.md).

---

## 1. Ce qu'elle est, et ce qu'elle n'est pas

**C'est un identifiant**, pas un secret. Elle est imprimée, dictée au téléphone,
lue sur un relevé bancaire. La protéger comme un jeton n'aurait aucun sens : ce
qu'on lui demande, c'est d'être **unique**, **non énumérable** et **muette sur
nos affaires**.

**C'est nous qui la frappons.** C'est précisément ce que la sortie de Stripe
débloque : la référence venait d'eux et n'existait qu'**après** l'enregistrement,
donc un mandat prérempli ne pouvait pas la porter. Sous notre propre ICS, elle
existe **avant** l'impression — et c'est elle qui transforme une fiche marquée
« EXEMPLE » en document qu'un client peut valablement signer.

**Elle est immuable.** Réécrire une RUM invaliderait le papier qui la porte.

---

## 2. Les contraintes, et d'où elles viennent

| Contrainte          | Valeur                                                 | Source                      |
| ------------------- | ------------------------------------------------------ | --------------------------- |
| Longueur maximale   | **35 caractères**                                      | la norme EPC                |
| Longueur **réelle** | **26 caractères**                                      | 🔴 le peigne du formulaire  |
| Jeu de caractères   | lettres non accentuées, chiffres, quelques séparateurs | le jeu **SEPA restreint**   |
| Unicité             | une RUM par créancier                                  | `UNIQUE (creditor_id, rum)` |

### 🔴 La vraie borne est 26, pas 35 — et elle vient du papier

`sepa-mandate-pdf.ts` dessine la case de la référence en `comb(…, [26])` :
**vingt-six cases**. Et `comb` remplit case par case en ignorant **silencieusement**
tout caractère au-delà de la dernière — aucune erreur, aucun débordement visible.

Une RUM de 29 caractères sortirait donc **tronquée à 26** sur le papier signé,
pendant que la base en stocke 29. Le document et l'enregistrement diraient deux
choses différentes, et l'écart ne se verrait qu'en contestation — c'est-à-dire au
pire moment.

⚠️ **Élargir le peigne n'est pas une sortie** : 29 cases à partir de son abscisse
finissent au-delà du refend vertical de l'en-tête, donc le peigne entrerait dans
la cellule du logo. La borne de 26 est **imposée par la mise en page du modèle
EPC**, pas par un choix qu'on pourrait renégocier.

_(Constaté le 2026-09-12, en contradiction du plan de la tranche.)_

⚠️ Le jeu restreint n'est pas une coquetterie : un accent dans une référence fait
**rejeter le fichier entier** par la banque, pas la ligne. C'est la même règle
qui transforme « Val d'Isère » en « Val d Isere » dans un `pain.008`.

---

## 3. 🔴 Comment elle est frappée — décidé le 2026-09-12

**`LFC` + 23 caractères tirés du `SecretGenerator`** de `platform`.

|          | valeur                                                           |
| -------- | ---------------------------------------------------------------- |
| longueur | **26**, exactement le nombre de cases du formulaire              |
| alphabet | Crockford base32 sans `I`, `L`, `O` ni `U`                       |
| entropie | **115 bits**, sans composante temporelle                         |
| préfixe  | `LFC`, pour reconnaître une de nos références au milieu d'autres |

⚠️ **23 et pas 26**, parce que le préfixe entre dans les mêmes cases. Le
`SecretGenerator` rend 26 caractères : on en prend les 23 premiers, ce qui reste
un tirage uniforme — chaque caractère est indépendant.

115 bits au lieu de 130 : l'écart est sans conséquence. Il faudrait de l'ordre de
10¹⁷ mandats pour qu'une collision devienne probable, et l'index d'unicité
l'attraperait de toute façon.

Le préfixe n'a aucune valeur technique. Il sert au moment où un client appelle
avec, pour seule information, la ligne de son relevé.

### Pourquoi plus l'identifiant du mandat

La première version dérivait la RUM de l'ULID du mandat. Un ULID porte **48 bits
d'horodatage** puis 80 bits d'aléa.

**Ce que ça n'ouvrait pas** : une énumération. 80 bits d'aléa ne se parcourent
pas — l'attaque « deviner la RUM d'un autre client » était déjà fermée.

**Ce que ça ouvrait** : deux RUM révélaient l'**ordre de création et l'écart de
temps**, et deux mandats du même jour partageaient leurs huit premiers
caractères. C'est une fuite de métadonnées — quand on a signé qui, à quel
rythme. Gratuite à retirer, donc retirée.

### Pourquoi pas un UUID

Deux raisons dirimantes, et une troisième qui suffirait :

- sans tirets il fait **32 caractères**, soit **six de trop** pour les 26 cases
  du formulaire. Ce n'était même pas la vraie raison quand elle a été écrite : on
  croyait la borne à 35, et un UUID y tenait tout juste. La borne est 26 ;
- il ne porte que **122 bits** en 32 caractères, là où la base32 en met **115 en 23** — soit une densité bien supérieure, ce qui est tout ce qui compte quand les cases sont comptées ;
- l'UUID **v7** est horodaté : il réintroduirait exactement ce qu'on retire.

### Pourquoi le `SecretGenerator` et pas un tirage local

Le port existe, avec son adaptateur `randomBytes` et son doublé déterministe
pour les tests. Son alphabet a été choisi pour être **dicté au téléphone** — les
quatre lettres écartées sont celles qu'on confond avec `1` et `0`. C'est
exactement l'usage que la RUM invoque.

🔴 Et il tire de `node:crypto`, **jamais `Math.random()`** : le `CLAUDE.md` §3.2
l'interdit pour fabriquer un identifiant, et `lint:clock-port` le tient.

---

## 4. Ce qu'on perd, et pourquoi c'est acceptable

La dérivation par l'ULID se défendait par deux arguments, et ils étaient bons
quand ils ont été écrits.

**« Collision impossible par construction »** devient « improbable, plus index
unique ». Mais la tranche qui frappe la RUM pose de toute façon
`UNIQUE (creditor_id, rum)` — la base l'attrape. Et à 130 bits, l'événement
n'arrive pas.

**« Retrouver le mandat depuis sa seule référence, sans table de
correspondance »** — cet argument **tient toujours**, par ce même index.

Les deux étaient plus forts avant que l'index existe. ⚠️ Le JSDoc de `Rum` les
invoque encore : il doit être réécrit dans le **même commit** que la bascule,
sans quoi il défendra un mécanisme disparu.

---

## 5. Les références qui ne viennent pas de nous

`Rum.create` relit une référence venue d'un **import** ou d'un **fichier de
retour**. C'est par là qu'entrent les RUM **tierces** — une reprise de
portefeuille en apporte, et elles peuvent se heurter entre elles.

🔴 **C'est ce qui justifie l'index d'unicité**, et pas la méfiance envers notre
propre frappe. Une garantie qui ne couvre que ce qu'on fabrique ne couvre pas ce
qu'on reçoit.

---

## 6. État

**Le value object existe, complet et testé** —
`apps/lfd-api/src/b2b/payments/domain/value-objects/rum.ts` — et **aucun fichier
du dépôt ne l'importe** _(vérifié le 2026-09-12)_. Il est né avec le socle du
prélèvement direct, puis le chantier a été mis en pause.

**Ne pas le réécrire en croyant qu'il manque.** Ce qui reste à faire sur lui est
étroit : remplacer `forMandate` par une frappe aléatoire, et réécrire le JSDoc
qui défend l'ancienne.
