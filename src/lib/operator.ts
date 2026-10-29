// The operator's personal details for the legal notice and the privacy policy. They never live in
// the repository (it's public): the build reads them from environment variables, which the deploy
// workflow fills from the repository's Actions secrets and a local build from the git-ignored .env.
// A missing value shows as a placeholder on the page.
const env = (key: string) => process.env[key]?.trim() || null;

export const operator = {
  name: env("LEGAL_NAME"), // first and last name
  street: env("LEGAL_STREET"), // street and number
  city: env("LEGAL_CITY"), // postcode and city
  email: env("LEGAL_EMAIL"),
};
