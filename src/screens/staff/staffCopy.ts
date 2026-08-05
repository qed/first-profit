/**
 * All staff-page copy in ONE object, for review — the convention the staff
 * screen has followed since Change #9. It moved out of StaffSuggestions.tsx in
 * Unit 3 (the two-tab shell) purely so the shell and both tabs can share it
 * without a circular import.
 *
 * Two conventions worth keeping:
 *  - ONE string per label. `suggestionsTitle` names both the tab button and the
 *    panel heading; a separate "tab label" key would be a copy of it, free to
 *    drift.
 *  - Per-tab strings are NAMESPACED (`suggestionsLoading`, not `loading`), so
 *    the Watchtower's own trio in Unit 5 lands beside them instead of on top
 *    of them.
 */
export const STAFF_COPY = {
  // ONE page title, identical signed-out and signed-in: the h1 lives in the
  // shell, so every view (sign-in, refusal, tabs) renders beneath it.
  title: "First Profit Staff Page",
  signInTitle: "Staff sign-in",
  email: "Email",
  password: "Password",
  showPassword: "Show password",
  hidePassword: "Hide password",
  signIn: "Sign in",
  signOut: "Sign out",
  refusal: "This page is for First Profit staff.",
  signInFailed: "Sign-in failed. Check the email and password.",
  signInIncomplete: "Enter the email and password.",
  retry: "Retry",

  // Tab labels — each is also its panel's h2.
  suggestionsTitle: "Suggestions",
  watchtowerTitle: "Watchtower",

  // Suggestions tab.
  suggestionsLoading: "Loading suggestions…",
  suggestionsLoadFailed: "Could not load suggestions. Try again.",
  suggestionsEmpty: "No suggestions yet.",

  // Watchtower tab. Leads with the STATE, not the promise: this tab's whole
  // job is reporting absence (nobody stalled, nothing queued), so an unbuilt
  // tab that reads like an empty RESULT is the one confusion that matters here.
  watchtowerPending: "Not built yet. The flow board arrives in a later release.",
} as const;
