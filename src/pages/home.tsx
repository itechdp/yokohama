import { Link } from "react-router";
import { ArrowUpRight, LogOut, Moon, Sun } from "lucide-react";
import { FEATURE_ITEMS } from "@/lib/nav-items";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/contexts/auth-context";

// "Pile of used tires" by Robert Laursoo (@robineero) on Unsplash — free Unsplash License.
const HERO_IMAGE_URL = "https://images.unsplash.com/photo-1578844251758-2f71da64c96f?auto=format&fit=crop&w=1200&q=60";

export default function Home() {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const items = FEATURE_ITEMS.filter((item) => !item.adminOnly || user?.role === "admin");

  return (
    <div className="min-h-full bg-primary/5">
      <div
        className="relative bg-cover bg-center px-6 pb-8 pt-6"
        style={{
          backgroundImage: `linear-gradient(to bottom, rgb(0 0 0 / 0.75), rgb(0 0 0 / 0.45) 65%, transparent), url('${HERO_IMAGE_URL}')`,
        }}
      >
        <header className="flex h-16 items-center justify-between gap-2">
          <span className="rounded-full bg-black/30 px-3 py-1 text-lg font-extrabold tracking-wide text-white drop-shadow-md backdrop-blur-sm">
            Crown Pvt. Ltd.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="flex size-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm transition-transform active:scale-95"
            >
              {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </button>
            <button
              type="button"
              onClick={logout}
              aria-label="Log out"
              className="flex size-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm transition-transform active:scale-95"
            >
              <LogOut className="size-5" />
            </button>
          </div>
        </header>

        <h1 className="text-3xl font-semibold leading-snug text-white">
          Hi there, manage your <span className="text-warning">tyre warehouse</span> with ease —
          Inward, Picking and beyond!
        </h1>
        <p className="mt-2 text-[11px] text-white/60">Photo by Robert Laursoo on Unsplash</p>
      </div>

      <div className="px-6 pb-10 pt-8">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-6">
          {items.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className="flex w-16 flex-col items-center gap-2 text-center">
              <span className="flex size-16 items-center justify-center rounded-full bg-card shadow-sm ring-1 ring-border transition-transform active:scale-95">
                <Icon className="size-6 text-primary" />
              </span>
              <span className="text-xs font-medium text-foreground">{label}</span>
            </Link>
          ))}

          <Link
            to="/tires/inward"
            className="flex min-w-[200px] flex-1 items-center justify-between gap-3 rounded-full bg-card px-5 py-3 shadow-sm"
          >
            <div>
              <p className="text-sm font-semibold text-foreground">One tap away</p>
              <p className="text-xs text-muted-foreground">Start an inward or picking move</p>
            </div>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <ArrowUpRight className="size-4" />
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
