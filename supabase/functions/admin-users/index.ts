import { handleAdminUsers } from "../_shared/handlers.ts";
import { serve } from "../_shared/runtime.ts";

// Deploy with: supabase functions deploy admin-users --no-verify-jwt   (the handler verifies the caller itself)
serve(handleAdminUsers);
