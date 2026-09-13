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

✅ **Elle est frappée depuis le 2026-09-12 au soir.**
`POST /admin/companies/:id/mandate` appelle `Rum.mint` et écrit un mandat à
l'état `draft`.

✅ **Et elle s'imprime depuis le 2026-09-13.** `renderSepaMandatePdf` prend une
émission, la RUM entre dans le peigne de 26 cases, et le filigrane EXEMPLE tombe
— commandés par le **même** paramètre, donc impossibles à découpler. Le peigne
refuse au-delà de 26 plutôt que de tronquer.

🔴 **Ce que le papier ne dit toujours pas : son schéma.** Il est rédigé en
formulaire **CORE** pendant que le lot déclare `B2B` — voir
[`../todos/todo-mandat-core-contre-b2b.md`](../todos/todo-mandat-core-contre-b2b.md).

**Elle est immuable.** Réécrire une RUM invaliderait le papier qui la porte.

---

## 2. Les contraintes, et d'où elles viennent

| Contrainte          | Valeur                                                 | Source                     |
| ------------------- | ------------------------------------------------------ | -------------------------- |
| Longueur maximale   | **35 caractères**                                      | la norme EPC               |
| Longueur **réelle** | **26 caractères**                                      | 🔴 le peigne du formulaire |
| Jeu de caractères   | lettres non accentuées, chiffres, quelques séparateurs | le jeu **SEPA restreint**  |
| Unicité             | une RUM par créancier                                  | 🔴 **à créer** — voir §5   |

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

**`LFC` + le code du client + la date de frappe + six symboles tirés au sort.**

```
LFC-9P2X4B-260912-K7M3QT
 │     │       │      └── 6 symboles du `SecretGenerator` — la part imprévisible
 │     │       └───────── YYMMDD, à Europe/Paris — la date de FRAPPE
 │     └───────────────── le code de `Company.reference`, sans son `C-`
 └─────────────────────── notre préfixe
```

|          | valeur                                                  |
| -------- | ------------------------------------------------------- |
| longueur | **24**, sous les 26 cases du formulaire                 |
| alphabet | Crockford base32 sans `I`, `L`, `O` ni `U`, plus le `-` |
| entropie | **~60 bits** — 30 du code client, 30 du tirage          |

### Pourquoi une forme lisible plutôt qu'un tirage opaque

Une première version rendait `LFC` + 23 symboles du `SecretGenerator` : 115 bits,
aucune structure. Elle a été écartée pour une raison qui ne se voit qu'au
téléphone — **un client appelle avec, pour seule information, la ligne de son
relevé bancaire.** Une référence structurée dit tout de suite qui et quand ; une
référence opaque impose une recherche en base avant de pouvoir répondre.

### 🔴 La fuite de métadonnées est ASSUMÉE — décidé le 2026-09-12

Deux RUM comparées révèlent l'ordre et l'écart de leurs dates de frappe. C'est
**exactement** ce qui avait fait écarter une dérivation par l'ULID du mandat, et
la contradiction est délibérée, pas un oubli :

- l'horodatage d'un ULID ne s'achetait **rien** — il était gratuit à retirer,
  donc retiré ;
- `YYMMDD` paie la lisibilité au support, tous les jours.

Et son audience est quasi nulle : un client ne voit jamais que **sa propre** RUM.
Comparer deux RUM suppose une collusion entre deux clients, pour apprendre le
jour où l'autre a signé.

⚠️ Ne pas « corriger » l'un des deux passages en croyant qu'ils se contredisent
par accident.

### 🔴 `YYMMDD` est la date de FRAPPE, jamais celle de la signature

La RUM existe **avant** l'impression ; le client signe et renvoie le scan des
jours plus tard. Les deux dates diffèrent toujours, et c'est celle de la
**signature** — pas celle-ci — qui alimente le `DtOfSgntr` obligatoire d'un
`pain.008`.

Lire cette estampille comme une date de consentement serait la même faute que
celle qu'`accepted_at` commet aujourd'hui en étant NOT NULL : un champ qui nomme
autre chose que ce qu'il contient.

### Pourquoi reprendre la référence client ne l'affaiblit pas

Parce que `Company.reference` **n'est pas un compteur**. `platform/id/reference.ts`
la dérive de la **queue** d'un ULID — soit 30 bits d'aléa, dans un alphabet sans
caractères ambigus _(vérifié le 2026-09-12)_. Elle ne révèle donc ni notre nombre
de clients, ni leur ordre d'arrivée, et la RUM reste hors de portée d'une
énumération : 60 bits en tout.

🔴 **C'est la seule hypothèse que la frappe fait sur un autre contexte.** Le jour
où cette référence deviendrait séquentielle, ce paragraphe serait faux et la
forme serait à revoir.

### Le fuseau, et pourquoi il est écrit

L'estampille se lit à **`Europe/Paris`**, jamais en UTC ni au fuseau du serveur.
Un mandat frappé à 00h30 à Paris tombe la veille en UTC : la référence imprimée
contredirait la date affichée à l'écran le même soir, et l'écart ne se verrait
que sur un papier déjà signé. Deux tests le tiennent, un par saison.

---

## 4. Les deux bornes, et pourquoi elles diffèrent

| Méthode      | Borne  | Raison                                          |
| ------------ | ------ | ----------------------------------------------- |
| `Rum.mint`   | **26** | le peigne du formulaire, qui tronque en silence |
| `Rum.create` | **35** | la norme EPC                                    |

La relecture est **volontairement plus permissive que la frappe**. Une référence
déjà en base n'a pas forcément été frappée ici — l'ère Stripe en a posé, et une
reprise de portefeuille en apportera d'autres. Resserrer `create` sur 26 ferait
échouer la **rehydratation** d'un mandat parfaitement valide : ce serait refuser
un fait accompli au nom d'une règle qui ne s'applique qu'à ce qu'on écrit.

---

## 5. Les références qui ne viennent pas de nous

⚠️ **Cette section décrit une INTENTION, pas un mécanisme** — corrigé le
2026-09-12 au soir. Elle était écrite au présent de l'indicatif, et se lisait
donc comme un état des lieux.

`Rum.create` est **plus permissif que `mint`** pour pouvoir relire une référence
qui ne vient pas de notre frappe : une reprise de portefeuille, un fichier de
retour. Ces RUM **tierces** peuvent se heurter entre elles, là où notre propre
frappe ne se heurte qu'à elle-même.

🔴 **C'est ce qui justifierait l'index d'unicité**, et pas la méfiance envers
notre frappe : une garantie qui ne couvre que ce qu'on fabrique ne couvre pas ce
qu'on reçoit.

**Ce qui est vérifié** _(tout au 2026-09-12 au soir)_ :

| Affirmation                                      | État                                                         |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `Rum.create` accepte 35 caractères, `mint` 26    | ✅ `rum.ts` — `RUM_EPC_MAX_LENGTH`, `RUM_PRINTED_MAX_LENGTH` |
| `Rum.mint` a un appelant de production           | ✅ `mint-mandate.handler.ts`                                 |
| `payment_mandates.reference` est unique          | ✅ `UNIQUE (COALESCE(creditor_id,'LEGACY'), reference)`      |
| la colonne `creditor_id` existe                  | ✅ nullable, clé étrangère vers `legal_entities`             |
| `Rum.create` relit des références importées      | ❌ aucun appelant                                            |
| un import de portefeuille existe                 | ❌ rien dans le dépôt                                        |
| un fichier de retour est lu (`camt`, `pain.002`) | ❌ rien dans le dépôt                                        |

🔴 **`COALESCE(creditor_id, 'LEGACY')` et non la colonne nue.** Dans un index
d'unicité, `NULL` est distinct de `NULL` : sur la colonne nue, deux références
reprises sans émetteur connu coexisteraient sans que rien ne s'y oppose —
c'est-à-dire exactement le cas contre lequel cet index existe.

La permissivité de `create` ne protège encore rien, parce que rien ne l'appelle.
Elle sera juste le jour où un import existera ; l'index, lui, est déjà là.

---

## 6. État — au 2026-09-12 au soir

**Le value object est frappé, testé (16 tests) et appelé en production** —
[`rum.ts`](../../apps/lfd-api/src/b2b/payments/domain/value-objects/rum.ts),
importé par
[`mint-mandate.handler.ts`](../../apps/lfd-api/src/b2b/payments/application/commands/mint-mandate.handler.ts).

Les quatre blocages que ce paragraphe listait sont levés :

| Ce qui bloquait                         | Ce qui est en place                                                    |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `accepted_at` NOT NULL                  | nullable ; l'état `draft` existe dans l'enum                           |
| `save()` n'écrivait que quatre colonnes | il écrit statut, dates, compte et pièce                                |
| aucune unicité sur `reference`          | `UNIQUE (COALESCE(creditor_id,'LEGACY'), reference)`                   |
| deux brouillons coexistants             | `UNIQUE (company_id) WHERE status = 'draft'`, et `findDraft` les nomme |

La RUM voyage désormais jusqu'au fichier de prélèvement : `MndtId` porte la
référence du mandat actif, lue par le port `DebtorMandateReader`.

✅ **Et elle atteint le papier** depuis le 2026-09-13 : elle s'imprime dans le
peigne du formulaire, et le filigrane EXEMPLE tombe avec elle.

🔴 **Ce qui reste** ne concerne plus la RUM mais le formulaire qui la porte : il
est rédigé en **CORE** alors que le lot déclare `B2B`. C'est le seul TODO de ce
dossier —
[`../todos/todo-mandat-core-contre-b2b.md`](../todos/todo-mandat-core-contre-b2b.md).
