import { passwordProblem } from "@/lib/user-policy";

// Characters that cannot be mistaken for each other when read aloud or copied by hand
// (no 0/O, 1/l/I). Used for the passwords an administrator hands to a new or reset user.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomIndex(max: number): number {
  // Rejection sampling so every character is equally likely.
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % max;
}

/** A random 14-character password that meets the password policy. */
export function generateTemporaryPassword(length = 14): string {
  for (;;) {
    let out = "";
    for (let i = 0; i < length; i++) out += ALPHABET[randomIndex(ALPHABET.length)];
    if (passwordProblem(out) === null && /[a-z]/.test(out) && /[A-Z]/.test(out) && /[2-9]/.test(out)) return out;
  }
}
