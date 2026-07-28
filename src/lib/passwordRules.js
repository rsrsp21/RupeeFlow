// Shared between the client (live checklist) and the server (auth.js) so the
// rules can never drift apart. Pure regex — safe to import from either side.
export const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'One lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { label: 'One number', test: (pw) => /[0-9]/.test(pw) },
];

export function passwordIssues(password) {
  const pw = password || '';
  return PASSWORD_RULES.filter((r) => !r.test(pw)).map((r) => r.label);
}
