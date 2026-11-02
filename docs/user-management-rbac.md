# User management, roles and module permissions

Super Admin / Admin / Operator accounts, per-module permissions for Operators, password
management and an audit log - enforced by the database, not just the screens.

**Status (2 Nov 2026):** migrations `rbac_01`-`rbac_05` are applied on production, the three
Edge Functions are deployed, and the accounts were replaced with the Super Admin (`Meck`) and one
Admin using `scripts/replace-users.mjs`. **The updated web app is not deployed yet**, so until it
is, the live site still shows the old sign-in and nobody can sign in on the tablets. No staging
project was used. See "Rollout".

## Roles

| | Super Admin | Admin | Operator |
|---|---|---|---|
| Modules | all | all | only the ones assigned |
| Create accounts | Admins, Operators | Operators | - |
| Rename / deactivate / delete | Admins, Operators | Operators | - |
| Change a role | yes (Admin <-> Operator) | no | no |
| Choose an Operator's modules | yes | yes | no |
| Reset someone's password | Admins, Operators | Operators | - |
| Change own password | yes (current password required) | **no** | **no** |
| See the Activity log | yes | no | no |

- There is exactly **one** Super Admin (`mehul`). A unique index, a trigger and every
  function refuse to create, promote, demote, deactivate or delete a Super Admin.
- Admins cannot touch other Admins or the Super Admin (they are listed read-only).
- Nobody can act on their own account through the admin functions.

## Modules and screens

| Module | Screens |
|---|---|
| Inward | `/tires/inward` |
| Putaway | `/tires/putaway` (Pending Putaway) |
| Picking | `/tires/picking` |
| Outward | `/tires/outward` |
| Stock | `/tires/stock` |
| Prepare Plan | `/plans` |
| Show Tire / SKU | `/tires/skus`, `/tires/new` (New Tyres), `/tires/bulk-upload` (Bulk Upload) |
| History | `/tires/history` (includes the Block Tyres history panel) |
| Loading Bay | `/bays`, `/bays/pending` (Pending Bay), `/bays/pending/:planNo`, `/bays/block` (Block Tyres), `/bays/block/:planNo` |
| Bay History | `/bays/history` |
| Warehouses | `/warehouses` |
| (staff only) | `/admin/users` (User management) |
| (everyone signed in) | `/` |
| (Super Admin only) | `/account/password` (change own password) |

`tests/user-management/route-access.test.ts` fails if a screen is added to `App.tsx`
without a guard, or with a different module than this table.

### What the database enforces per table
Tables are shared between modules, so a table is open to **any** module that legitimately
uses it. Admin/Super Admin: everything. (Full list at the top of `rbac_05_rls_cutover.sql`.)

| Table | Read | Write |
|---|---|---|
| `tires` | inward picking outward stock history warehouses show_tire | inward picking outward stock warehouses show_tire |
| `tire_skus` | inward picking outward stock prepare_plan show_tire loading_bay | show_tire |
| `warehouses` | inward putaway picking outward stock warehouses | warehouses |
| `inward_pending` | inward putaway | insert: inward (rules kept) |
| `inward_receipts` | inward history | inward |
| `placement_logs` | history inward | inward |
| `tire_history` | history | inward |
| `picks`, `deleted_tires` | picking history | picking |
| `outwards` | outward history | outward |
| `plan_numbers` | inward picking outward | inward picking outward |
| `prepared_plans` | prepare_plan picking outward | prepare_plan |
| `plan_pending_tires` | loading_bay picking | loading_bay picking |
| `plan_block_tires` | loading_bay history | insert: loading_bay (rules kept) |
| `bay_bookings` | loading_bay | loading_bay |
| `bay_plan_history` | loading_bay bay_history | loading_bay |

**Limits to know about** (shared tables):
- Someone with only *Show Tire / SKU* can insert rows into `tires` (Add tyre / bulk upload
  needs it). Someone with only *Warehouses* can delete the tyres in a warehouse (existing
  behaviour of that screen). Stricter per-module isolation on shared tables would mean
  moving those writes into functions - not done in this phase.
- `putaway_pallet` writes several tables as the function owner; the new
  `app_putaway_pallet` wrapper requires the Putaway module first.

## How it works

- **Sign-in:** Supabase Auth. The username is looked up server-side; the Auth account uses
  a synthetic address built from the user's id (`<id>@users.yokohama.invalid`), so renaming
  never touches Auth. The `auth-login` Edge Function adds brute-force lockout (5 wrong
  passwords per username or 20 per address in 15 minutes) and answers every failure
  (unknown user, wrong password, deactivated) with the same message.
- **Identity:** every database function reads `auth.uid()` and the session id from the
  verified token - never an id sent by the browser. Deleting a session (deactivate, role
  change, password reset) locks the person out **immediately**, not when the token expires.
- **Privileged actions:** the `admin-users` Edge Function (create / reset password / delete)
  first asks the database to authorise the caller with the caller's own session
  (`app_authorize_manage`), and only then uses the service key. The service-only database
  functions re-check the hierarchy again. If a step fails midway, it is undone.
- **Passwords:** minimum 10 characters, at most 72 bytes, not repetitive, cannot contain the
  username (`supabase/functions/_shared/policy.ts`, shared by screens and server). Stored by
  Supabase Auth. Nobody can see an existing password.
  - **Admins and Operators always use the password an authorised administrator set for them.**
    There is no first-sign-in password change, no Change Password screen, and no way for them to
    change or reset their own password. The Super Admin sets Admin and Operator passwords
    (create / reset); an Admin sets Operator passwords only.
  - **Only the Super Admin can change their own password** (`/account/password`, current password
    required, other sessions signed out). The `change-password` Edge Function answers 403 to
    everyone else, using the role read from the database, not from the request.
  - A reset signs the person out everywhere, so the new password is used from then on.
  - `app_profiles.must_change_password` is no longer read by the app (nothing is forced). The
    column and the two database functions that still set it are left as they were.
- **Audit log:** `app_audit_log` (append-only) records create, delete, rename (old and new
  name), role change, module change, activate/deactivate, password reset/change and lockouts.
  The Super Admin sees it under User management -> Activity.
- **History keeps the old name:** history tables store the username as text. Renaming a user
  changes only their login name; existing rows keep the name they were written with.
- **Existing users:** keep their id and password. `public.users` is never modified. Existing
  Operators start with **every** module.

## Files

| Area | Files |
|---|---|
| Database (apply in order) | `supabase/migrations/rbac_01_foundation.sql`, `rbac_02_functions.sql`, `rbac_03_workflow_functions.sql`, `rbac_04_backfill_profiles.sql` (data), `rbac_05_rls_cutover.sql` (the step that closes the open access) |
| Rollback | `supabase/rollback/rbac_rollback_stage_a.sql`, `rbac_rollback_stage_c.sql` |
| Edge Functions | `supabase/functions/auth-login`, `admin-users`, `change-password`; logic in `_shared/handlers.ts`, rules in `_shared/policy.ts` |
| One-off (already run) | `scripts/replace-users.mjs` with its rules in `scripts/replace-plan.ts`: left exactly the renamed Super Admin plus one Admin. Dry run by default; do not re-run. |
| App | `src/lib/auth-client.ts`, `src/contexts/auth-context.tsx`, `src/components/protected-route.tsx`, `src/lib/route-access.ts`, `src/lib/modules.ts`, `src/lib/nav-items.ts`, `src/App.tsx`, `src/pages/home.tsx`, `src/pages/admin-users.tsx`, `src/pages/change-password.tsx`, `src/components/module-picker.tsx` |
| Changed calls | `inward-putaway.ts`, `inward-pending.ts`, `plan-block-tires.ts`, `block-tyre-detail.tsx` (no user id / name sent from the browser) |

## Testing

```bash
npm run typecheck
npm run test:user-management      # rules + all three Edge Function handlers (fakes)
npm run test:route-access         # every role x every route + "no unguarded screen"
npm run test:putaway && npm run test:block-tyres && npm run test:delete-safety
tests/sql/run-rbac-tests.sh /tmp/some-new-dir        # database rules on a throwaway local Postgres
tests/sql/run-local-pg-tests.sh /tmp/another-new-dir # the existing inward/putaway SQL suite
```

`run-rbac-tests.sh` builds its own throwaway cluster (127.0.0.1 only, deleted afterwards),
applies the repo's migrations plus rbac_01-05, and attacks the rules as Super Admin, Admin,
Operators, anonymous callers, forged sessions and the service role, then tests both
rollbacks. It models Supabase's `auth` schema by hand: **real Supabase Auth behaviour is
only proven on the real project** (sign-in on the deployed site).

## Rollout

Done:
1. `rbac_01`-`rbac_05` applied on production.
2. Edge Functions deployed (`supabase functions deploy <name> --project-ref <ref> --no-verify-jwt`
   for `auth-login`, `admin-users`, `change-password`). Optional secret `ALLOWED_ORIGINS`
   (defaults to `https://crown-pvt-ltd.vercel.app,http://localhost:3000`).
3. Accounts replaced with `scripts/replace-users.mjs` (dry run, review, then `--apply
   --expect-delete=<N>`). The old `public.users` table and its password hashes were not touched.

Required dashboard settings (Authentication): sign-ups disabled, minimum password length 10.

Still to do:
4. Deploy the web app. The tablets load `https://crown-pvt-ltd.vercel.app`, so every tablet gets it
   at once and everyone signs in again.
5. Check sign-in on the deployed site and on a tablet (manual checklist below).

Rollback: Stage C (`rbac_rollback_stage_c.sql`) restores the old open access and the old sign-in
functions (the previous web build only works against that); Stage A (`rbac_rollback_stage_a.sql`)
removes the new tables and functions, **including every account, permission and audit entry created
since**. Last resort: a verified backup (production has no automatic backups).

**Before `rbac_03` on a real database:** compare `putaway_pallet` / `cancel_pending_pallet`
with the live definitions (`select pg_get_functiondef(...)`). `rbac_03` replaces them with
the repository versions plus one changed line.

**Tablets:** older APKs in the repo (`CrownPvtLtd.apk`, `Crown-debug.apk`,
`android/.../app-debug.apk`) point at `yokohama-rho.vercel.app`, which no longer exists.
Update any tablet still running one before the cutover. No APK rebuild is needed for this
feature; the kiosk code is unchanged.

### Manual checklist (after the web app is deployed)
Super Admin: sign in; create an Admin and an Operator with chosen modules; rename; change
role; reset a password; deactivate -> the person is signed out within a minute and cannot sign
in; reactivate; delete; Activity shows each action. Try to create a second Super Admin (must
be impossible). Admin: can manage Operators only; other Admins are view-only. Operator: sees
only assigned tiles; typing a restricted URL returns to home with a notice; no Password button,
and typing /account/password returns to home (same for an Admin); there is no forced password
change at first sign-in for anyone. Super Admin: Password button works and needs the current
password; resetting an Admin's or Operator's password signs them out and the new one works. Admin:
Reset password is offered for Operators only. 5 wrong passwords lock the account for 15 minutes. Tablet: kiosk lock, Wi-Fi and mobile-data menus unaffected. Data:
row counts identical before and after; Inward -> Putaway -> Picking -> Outward still work.

## Known limits
- Supabase Auth's own `updateUser` can change a password for a signed-in session without
  asking for the current one. The app never calls it and always goes through `change-password`
  (Super Admin only), but a signed-in Admin or Operator who calls the Auth API directly with their
  own session could still change their own password. Closing that needs a database trigger on
  `auth.users` (not implemented; it touches Supabase's own schema and needs a test on a real
  Auth service first).
- Lockout is per username and per address. Supabase Auth's own `/token` endpoint is only
  reachable by someone who knows a user's UUID (the login address is built from it).
- `public.users` keeps the old password hashes (needed for rollback). Plan to remove them
  after a stable period, with approval.
- The unused exit-PIN functions (`exit_pin_setting.sql`) are untouched.
