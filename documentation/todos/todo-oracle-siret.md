# TODO — `SiretAlreadyRegisteredError` dit qui est client

**Statut** : 📝 **risque accepté par Hugo le 2026-11-14** — l'oracle reste,
rien n'est bâti. Le plan de la piste 1 est prêt, contredit quatre fois par
`vitruve`, et rangé : [`../auth-inscription/plan-siret-sans-oracle.md`](../auth-inscription/plan-siret-sans-oracle.md).

## La décision du 2026-11-14

Ce que l'oracle révèle est faible : « cette maison est cliente », sans prix,
sans volume, sans donnée personnelle — et le fournisseur d'un café se voit
souvent sur place. Il faut connaître les SIRET à tester et les essayer un à un
depuis un compte ouvert chez nous ; la limite de requêtes par IP de la
passerelle le freine.

Ce que coûtait la fermeture (plan v4) : un statut de plus au cycle de vie d'une
société (`declined`), le tri de dix lecteurs de `terminated`, deux gestes
staff, une migration qui ne se défait plus après le premier doublon — et un
oracle humain qui reste (un doublon n'est jamais activé). Trop de surface pour
une fuite faible.

**À rouvrir** si la fuite devient sensible (ouverture commerciale, concurrent
identifié) : le plan v4 est la réponse. Un entre-deux a été écarté le même
jour, et reste disponible : une limite de déclarations de société par compte
et par jour, et une alerte dans la Santé sur les refus répétés.

Le geste « décliner une ouverture » (`pending → declined`) a de la valeur hors
de l'oracle — fermer une ouverture abandonnée, impossible aujourd'hui — et
peut sortir seul, avec son statut (plan v4, § 2.2).
**Origine** : `documentation/auth-inscription/plan-inscription-pro-seule.md` §1.7 et §3.4.

## Le constat

`POST /companies` et la mise à jour d'identité d'une société répondent **409**
« Une entreprise portant ce SIRET est déjà enregistrée. » quand le SIRET envoyé
existe déjà (`lafoliecoffee/account/domain/errors/account-errors.ts`,
`SiretAlreadyRegisteredError` ; traduction de la violation d'unicité dans
`prisma-company.repository.ts`, `translateSiretClash`). Vérifié le 2026-09-14.

Un SIRET est une donnée **publique**. Il suffit donc d'un jeton client — et
l'inscription client est ouverte à tous depuis le 2026-08-27 — pour demander,
SIRET par SIRET, « cette maison est-elle cliente de La Folie Coffee ? ».

C'est exactement ce que le cycle de vie refuse pour les adresses
(`documentation/auth-inscription/architecture-compte-client-cycle-de-vie.md` §5) : **savoir
qui travaille avec qui est une information commerciale**, et aucune réponse
d'API ne doit révéler l'existence d'un client.

## Ce qui a été fait en attendant

Rien dans le code. La porte pro (`/ouverture-compte-pro`) **ne demande pas** le
SIRET, pour ne pas mettre l'oracle dans un formulaire public. Ça le cache ; ça
ne le ferme pas : un appel direct à la route suffit.

## Pistes, aucune tranchée

1. **Ne plus distinguer le cas côté client** : la société se déclare, et le
   doublon est signalé **au staff** (fiche, activation) plutôt qu'au déclarant.
   L'unicité devient une vérification d'activation, pas un refus de déclaration.
2. **Réponse neutre** : un refus qui ne dit pas pourquoi. Pénible pour le vrai
   gérant qui se trompe de chemin, et le délai ou le statut peuvent encore trahir.
3. **Garder le refus, mais seulement pour le staff** (`/admin/companies`), où le
   commercial a déjà le droit de savoir.

## À ne pas oublier

- Cette todo déplace une **frontière de divulgation** : son plan passe par
  `vitruve` (CLAUDE.md §9 bis).
- L'index unique en base sur le SIRET reste le filet : la piste 1 ne supprime
  pas l'unicité, elle change qui l'apprend et quand.
