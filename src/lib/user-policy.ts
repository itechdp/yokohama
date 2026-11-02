// The rules (password, username, role hierarchy, module keys) live in ONE file that the
// Edge Functions also use, so the screens and the server can never disagree.
export * from "../../supabase/functions/_shared/policy.ts";
