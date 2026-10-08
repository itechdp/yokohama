export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

async function postJson<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data?.error ?? "Request failed", res.status);
  }
  return data as T;
}

async function getJson<T>(path: string, token: string): Promise<T> {
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data?.error ?? "Request failed", res.status);
  }
  return data as T;
}

export type UserRole = "admin" | "operator";

export interface SessionUser {
  id: string;
  username: string;
  role: UserRole;
}

export function requestChallenge(username: string) {
  return postJson<{ challenge_token: string }>("/api/auth/challenge", { username });
}

export function login(params: {
  username: string;
  password: string;
  challenge_token: string;
  signature_b64: string;
  device_public_key_b64: string;
}) {
  return postJson<{ session_jwt: string; user: SessionUser }>("/api/auth/login", params);
}

export interface AdminUserRow {
  id: string;
  username: string;
  role: UserRole;
  is_active: boolean;
  device_registered: boolean;
  device_registered_at: string | null;
  created_at: string;
}

export function listUsers(token: string) {
  return getJson<{ users: AdminUserRow[] }>("/api/admin/users", token);
}

export function createUser(token: string, params: { username: string; password: string; role: UserRole }) {
  return postJson<{ user: AdminUserRow }>("/api/admin/users", params, token);
}

export function resetDevice(token: string, userId: string) {
  return postJson<{ ok: true }>(`/api/admin/users/${userId}/reset-device`, {}, token);
}

export async function deleteUser(token: string, userId: string): Promise<{ ok: true }> {
  const res = await fetch(`/api/admin/users/${userId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data?.error ?? "Request failed", res.status);
  }
  return data as { ok: true };
}
