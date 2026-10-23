import type { AccountMailsCopy } from "../model/account-mails.model.js";

/** La famille « compte client », en anglais. Traduction du français, pas une variante. */
export const ACCOUNT_MAILS_EN: AccountMailsCopy = {
  "customer.access-opened": {
    kicker: "Access granted",
    subject: "Your access to the {company} business area",
    title: "Welcome, {firstName}",
    titleWithoutName: "Welcome",
    opened:
      "Access to the business area of {company} has just been opened in your name " +
      "by the La Folie Coffee team.",
    choosePassword:
      "All that is left is to choose your password. The link below is valid for 7 days; " +
      "after that, just ask us to send you a new one.",
    choosePasswordCta: "Choose my password",
    signInWithCode:
      "Sign in with your address {email}: you will receive a code by email, " +
      "to type on the sign-in screen. No password to remember.",
    signInCta: "Sign me in",
    passwordLink: "Or choose a password (link valid for 7 days)",
    footer:
      "Not expecting this email? Ignore it: as long as nobody signs in " +
      "with this address, the access stays unused.",
  },
  "customer.company-attached": {
    kicker: "Company linked",
    subject: "{company} has been added to your business area",
    title: "Hello, {firstName}",
    titleWithoutName: "Hello",
    attached:
      "The establishment {company} has just been linked to your business area " +
      "by the La Folie Coffee team.",
    nothingToCreate:
      "You will find it the next time you sign in, with your usual credentials — " +
      "nothing new to create.",
    footer: "Not expecting this link? Reply to this email and we will remove it.",
  },
  "customer.login-method-linked": {
    kicker: "Sign-in method added",
    subject: "A {method} sign-in has been added to your account",
    title: "Hello, {firstName}",
    titleWithoutName: "Hello",
    linked:
      "You can now sign in to your La Folie Coffee account with " +
      "{method}, in addition to your usual method.",
    sameAccount: "It is the same account: same orders, same details.",
    footer:
      "You did not do this? Reply to this email: " +
      "we will remove this sign-in method and look into what happened.",
  },
  "customer.password-reset": {
    kicker: "Password",
    subject: "Your link to change your password",
    title: "Change your password",
    requested: "You have just asked to change the password of your La Folie Coffee account.",
    linkRules:
      "The link below can be used once and expires in {validity}. " +
      "Follow it to choose your new password.",
    validityOneHour: "{count} hour",
    validityHours: "{count} hours",
    cta: "Choose a new password",
    footer:
      "You did not make this request? Do not follow this link, and reply to this " +
      "email: we will look into what happened.",
  },
  "customer.sub-account-activity": {
    kicker: "Site activity",
    title: {
      placed: "Order placed by one of your sites",
      cancelled: "Order cancelled at one of your sites",
      abandoned: "Payment abandoned at one of your sites",
      payment_failed: "Payment failed at one of your sites",
    },
    action: {
      placed: "placed order",
      cancelled: "saw the cancellation of order",
      abandoned: "abandoned the payment of order",
      payment_failed: "could not pay for order",
    },
    subject: "{site} — {title} ({order})",
    body: "Your site {site} {action} {order}.",
    bodyEnteredByTeam: "Your site {site} {action} {order} (order entered by our team).",
    siteLabel: "Site",
    orderLabel: "Order",
    dayLabel: "For",
    totalLabel: "Amount incl. VAT",
    footer:
      "You are receiving this message because this site is linked to your account. " +
      "To stop receiving it, write to us: we set these notices role by role.",
  },
  "customer.sub-account-gesture": {
    kicker: "Your account",
    title: {
      problem_reported: "Problem reported by one of your sites",
      delivery_address_added: "Delivery address added at one of your sites",
      delivery_address_updated: "Delivery address changed at one of your sites",
      delivery_address_removed: "Delivery address removed at one of your sites",
      default_delivery_set: "Default delivery address changed at one of your sites",
      contact_added: "Contact added at one of your sites",
      contact_updated: "Contact changed at one of your sites",
      contact_removed: "Contact removed at one of your sites",
      primary_contact_changed: "Main contact changed at one of your sites",
      bank_account_changed: "New bank details at one of your sites",
      mandate_proof_attached: "Mandate proof filed at one of your sites",
      subscription_created: "Recurring basket created at one of your sites",
      subscription_paused: "Recurring basket paused at one of your sites",
      subscription_resumed: "Recurring basket resumed at one of your sites",
      subscription_stopped: "Recurring basket stopped at one of your sites",
    },
    action: {
      problem_reported: "reported a problem with order",
      delivery_address_added: "added a delivery address",
      delivery_address_updated: "changed a delivery address",
      delivery_address_removed: "removed a delivery address",
      default_delivery_set: "changed its default delivery address",
      contact_added: "added a contact",
      contact_updated: "changed a contact",
      contact_removed: "removed a contact",
      primary_contact_changed: "changed its main contact",
      bank_account_changed: "registered new bank details",
      mandate_proof_attached: "filed a mandate proof",
      subscription_created: "created a recurring basket",
      subscription_paused: "paused a recurring basket",
      subscription_resumed: "resumed a recurring basket",
      subscription_stopped: "stopped a recurring basket",
    },
    subject: "{site} — {title}",
    subjectWithReference: "{site} — {title} ({reference})",
    body: "Your site {site} {action}.",
    bodyWithReference: "Your site {site} {action} {reference}.",
    bodyByTeam: "Your site {site} {action} (done by our team).",
    bodyWithReferenceByTeam: "Your site {site} {action} {reference} (done by our team).",
    siteLabel: "Site",
    referenceLabel: "Reference",
    referenceLabelOf: { problem_reported: "Order" },
    footer:
      "You are receiving this message because this site is linked to your account. " +
      "To stop receiving it, write to us: we set these notices role by role.",
  },
};
