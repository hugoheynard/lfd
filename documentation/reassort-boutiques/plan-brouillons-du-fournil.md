# Plan — les brouillons du réassort du fournil

> 📝 **Plan** du 2026-10-28. Demande de Hugo, sur la carte « Envoyer un
> réassort » de l'onglet Réassorts (production) : « j'ai besoin d'un
> enregistrer comme brouillon en secondary button ». Choix du jour : le
> brouillon vit **au serveur**, pour être retrouvé depuis n'importe quel poste
> ou téléphone du fournil.
>
> ✅ **Bâti le 2026-10-28** : contrat `packages/contracts/src/bakehouse-resupply-draft.ts`,
> migration `20261028120000_les_brouillons_du_fournil`, agrégat
> `BakehouseResupplyDraft`, cinq routes, carte du fournil (liste des brouillons,
> « Enregistrer comme brouillon »).

Le fournil compose un réassort pour un point — un point, une visée, un nom, des
quantités dans la table du catalogue (lot R1d de
[`plan-reapprovisionnement.md`](plan-reapprovisionnement.md)). Jusqu'ici la
composition ne vivait qu'à l'écran et partait d'un geste. Un brouillon permet de
la poser, de la reprendre plus tard, ailleurs, puis de l'envoyer.

## 1. Pourquoi une table à part

Le brouillon n'est **pas** une ligne de `site_resupplies`, et ce n'est pas une
préférence :

- le CHECK `site_resupply_bakehouse_placed` interdit qu'un réassort du fournil
  y soit brouillon (vérifié le 2026-10-28 dans `prisma/schema/public/resupply.prisma`) ;
- l'index unique partiel `site_resupply_open_draft_key` ne tient qu'**une**
  demande en cours par (point, visée, journée), et c'est celle que le comptoir
  lit et remplit. Un brouillon du fournil y prendrait sa place ;
- un `SiteResupply` porte une **journée**, figée à sa création. Un brouillon
  repris trois jours plus tard viserait une journée passée.

D'où `public.bakehouse_resupply_drafts`, propriété du contexte
`b2b/resupply`. Le réassort n'existe qu'à l'envoi, par le chemin existant
(`SiteResupply.sentByBakehouse`), et rien de ce que lit le comptoir ne change.

## 2. Le modèle

Agrégat `BakehouseResupplyDraft` (`b2b/resupply/domain/`) :

| Champ                        | Règle                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `id`                         | ULID, `IdGenerator`                                                                 |
| `siteId`                     | obligatoire, le point doit exister (`ResupplySites.exists`)                         |
| `target`                     | `tomorrow` \| `asap`                                                                |
| `name`                       | `resupplyNameOf` (rogné, vide = `null`, 60 au plus) — la règle des réassorts        |
| `lines`                      | au moins une, au plus 200 ; quantité entière > 0 ; un même SKU deux fois **refusé** |
| `version`                    | verrou optimiste, +1 à chaque écriture                                              |
| `status`                     | `open` → `sent` \| `discarded`, dans ce sens seulement                              |
| `sentResupplyId`             | le réassort né de l'envoi (`sent` seulement)                                        |
| créé / enregistré / clos par | staff id + nom figé + instant du `Clock`, comme les traces des réassorts            |

- **Aucune journée** : elle se calcule à l'envoi, depuis la visée et l'instant.
- **Pas de DELETE** : « Supprimer le brouillon » le passe `discarded`.
- Les SKU ne se vérifient pas au catalogue à l'enregistrement : un article
  retiré entre-temps est refusé **à l'envoi**, par `catalogueLine`, avec le
  message existant. Un brouillon ne doit pas devenir impossible à rouvrir.
- `save(content, trace, version)` refuse un brouillon qui n'est plus `open`
  (`BusinessError`, 409) et une version périmée (409, le message dit qu'un autre
  poste l'a modifié et qu'il faut le rouvrir).

Les lignes vivent en `jsonb` (`[{ sku, quantity }]`) : elles se remplacent
toujours ensemble et ne se lisent jamais une à une. L'adaptateur les relit à
travers `bakehouseResupplyDraftLineSchema` ; une ligne illisible est une
`TechnicalError`, pas un brouillon vidé en silence.

Migration **additive** : une table, ses CHECK (`status` dans le vocabulaire ;
`sent_resupply_id` non nul si et seulement si `sent` ; `name` rogné, 1 à 60), un
index sur `(status, updated_at)`. Rien n'est écrit dans une table existante.

## 3. Les routes

Sur `AdminBakehouseResuppliesController`, sous `production_resupply` (le droit
de l'envoi du fournil) — un handler par cas, le contrôleur n'injecte que les bus :

| Route                                                 | Cas                             | Rend                               |
| ----------------------------------------------------- | ------------------------------- | ---------------------------------- |
| `GET  /admin/bakehouse-resupplies/drafts`             | `ListBakehouseResupplyDrafts`   | les `open`, le plus récent d'abord |
| `POST /admin/bakehouse-resupplies/drafts`             | `CreateBakehouseResupplyDraft`  | `{ id, version }`                  |
| `PUT  /admin/bakehouse-resupplies/drafts/:id`         | `SaveBakehouseResupplyDraft`    | `{ id, version }`                  |
| `POST /admin/bakehouse-resupplies/drafts/:id/discard` | `DiscardBakehouseResupplyDraft` | 204                                |
| `POST /admin/bakehouse-resupplies/drafts/:id/send`    | `SendBakehouseResupplyDraft`    | `{ id }` — le réassort créé        |

**Envoyer un brouillon** reçoit le contenu ENTIER de l'écran et la version lue
(`updateBakehouseResupplyDraftSchema`) : ce qui part est ce que l'écran montre,
pas ce qui était enregistré. Dans **une** unité de travail : le réassort est créé
par le même chemin que `SendBakehouseResupplyHandler` (extraire ce chemin dans
une fonction partagée, ne pas le recopier), puis le brouillon passe `sent` avec
l'id du réassort. Un refus de l'envoi (heure limite, plan arrêté, article
retiré) laisse le brouillon `open` et intact.

Les écritures ne sont **pas** tracées au journal, comme l'envoi du fournil
qu'elles empruntent : `SendBakehouseResupplyHandler` n'appelle pas
`publishTraced`, et `b2b/resupply` n'est dans aucune zone de
`lint:journal-tracked` (vérifié le 2026-10-28). L'auteur et l'instant sont figés
sur la ligne ; les handlers le disent par `@sans-journal`. Les colonnes de staff
sont au registre RGPD (`lint:rgpd-staff`), sur le modèle des traces de
`site_resupplies`.

## 4. L'écran

Carte `bakehouse-resupply-card` :

- **« Enregistrer comme brouillon »**, bouton secondaire (`emphasis="outline"`)
  à gauche d'« Envoyer », en haut à droite. Actif dès qu'un point est choisi et
  qu'une ligne existe. Crée, ou réécrit le brouillon repris.
- **Les brouillons ouverts**, au-dessus du point : une liste courte — nom (ou
  « Sans nom »), point, visée, nombre d'articles, qui et quand. « Reprendre »
  charge le brouillon dans la carte. « Supprimer » le passe `discarded`, après
  confirmation.
- Un brouillon repris : « Envoyer » passe par `…/send`, et le brouillon
  disparaît de la liste. « Nouveau réassort » vide la carte sans toucher au
  brouillon.
- Un 409 se dit dans la carte, et la liste se relit.

## 5. Les tests

- **Domaine** : transitions, ligne en double, quantité nulle, nom trop long,
  écriture sur un brouillon clos, version périmée.
- **Application** : création, réécriture, abandon, envoi (réassort créé puis
  brouillon `sent`, dans cet ordre, une seule unité de travail), envoi refusé
  qui laisse le brouillon `open`.
- **E2E** : l'aller-retour des cinq routes sur le vrai Postgres, le 409 de deux
  postes, l'envoi qui crée bien un `SiteResupply` d'origine `bakehouse`, et la
  demande en cours du comptoir **inchangée** après tout cela.
- **Front** : enregistrer, reprendre, envoyer un brouillon, supprimer.
