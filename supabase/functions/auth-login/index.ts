import { handleLogin } from "../_shared/handlers.ts";
import { serve } from "../_shared/runtime.ts";

// Deploy with: supabase functions deploy auth-login --no-verify-jwt   (it is called before anyone is signed in)
serve(handleLogin);
