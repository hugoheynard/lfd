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

✅ **Et il ne manque plus qu'elle.** Depuis le 2026-09-12 au soir, l'aperçu de
`GET /admin/companies/:id/mandate/preview.pdf` sort les deux blocs remplis — le
créancier, le débiteur, les zones facultatives, le type de paiement. La mention
EXEMPLE qu'il porte encore n'a plus qu'une seule cause, et c'est celle-ci.

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

`Rum.create` relit une référence venue d'un **import** ou d'un **fichier de
retour**. C'est par là qu'entrent les RUM **tierces** — une reprise de
portefeuille en apporte, et elles peuvent se heurter entre elles.

🔴 **C'est ce qui justifie l'index d'unicité**, et pas la méfiance envers notre
propre frappe. Une garantie qui ne couvre que ce qu'on fabrique ne couvre pas ce
qu'on reçoit.

⚠️ **Cet index n'existe pas encore.** La colonne `reference` de
`payment_mandates` ne porte aujourd'hui **aucune contrainte d'unicité**, et la
colonne `creditor_id` que ce document invoque n'existe pas non plus _(vérifié le
2026-09-12)_. L'unicité que la RUM exige est à créer ; elle n'est pas acquise.

---

## 6. État

**Le value object est frappé et testé** —
[`rum.ts`](../../apps/lfd-api/src/b2b/payments/domain/value-objects/rum.ts), 16
tests — et **aucun fichier du dépôt ne l'importe encore** _(au 2026-09-12)_.

Ce qui reste, et qui ne dépend plus de la RUM elle-même :

1. **l'état brouillon** — `accepted_at` est NOT NULL, donc un mandat frappé mais
   pas encore signé n'a pas de place dans le modèle ;
2. **le port d'écriture** — `save()` n'écrit que quatre colonnes, donc rien ne
   persisterait une RUM ni un état de brouillon ;
3. **l'unicité** — l'index du §5, qui n'existe pas ;
4. **le brouillon unique par société** — deux brouillons peuvent coexister, et
   `findCurrent` rend le plus récent : le scan reviendrait sur un mandat dont la
   RUM diffère de celle imprimée.
