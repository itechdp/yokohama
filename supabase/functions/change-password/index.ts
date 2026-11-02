import { handleChangePassword } from "../_shared/handlers.ts";
import { serve } from "../_shared/runtime.ts";

// Deploy with: supabase functions deploy change-password --no-verify-jwt   (the handler verifies the caller itself)
serve(handleChangePassword);
