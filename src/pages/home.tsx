import { useState } from "react";
import { Link } from "react-router";
import { ArrowUpRight, ChevronDown, ChevronUp, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { FEATURE_ITEMS, OTHER_PAGE_ITEMS } from "@/lib/nav-items";
import { useTheme } from "@/hooks/use-theme";

// "Pile of used tires" by Robert Laursoo (@robineero) on Unsplash — free Unsplash License.
const HERO_IMAGE_URL = "https://images.unsplash.com/photo-1578844251758-2f71da64c96f?auto=format&fit=crop&w=1200&q=60";

export default function Home() {
  const [showOther, setShowOther] = useState(false);
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-full bg-primary/5">
      <div
        className="relative bg-cover bg-center px-6 pb-8 pt-6"
        style={{
          backgroundImage: `linear-gradient(to bottom, rgb(0 0 0 / 0.75), rgb(0 0 0 / 0.45) 65%, transparent), url('${HERO_IMAGE_URL}')`,
        }}
      >
        <header className="flex h-16 items-center justify-between">
          <span className="rounded-full bg-black/30 px-3 py-1 text-lg font-extrabold tracking-wide text-white drop-shadow-md backdrop-blur-sm">
            Crown Pvt. Ltd.
          </span>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="flex size-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm transition-transform active:scale-95"
          >
            {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </button>
        </header>

        <h1 className="text-3xl font-semibold leading-snug text-white">
          Hi there, manage your <span className="text-warning">tyre warehouse</span> with ease —
          Inward, Outward and beyond!
        </h1>
        <p className="mt-2 text-[11px] text-white/60">Photo by Robert Laursoo on Unsplash</p>
      </div>

      <div className="px-6 pb-10 pt-8">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-6">
          {FEATURE_ITEMS.map(({ to, label, icon: Icon }) => (
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
              <p className="text-xs text-muted-foreground">Start an inward or outward move</p>
            </div>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <ArrowUpRight className="size-4" />
            </span>
          </Link>
        </div>

        <div className="mt-10">
          <button
            onClick={() => setShowOther((v) => !v)}
            className="flex w-full items-center justify-between rounded-2xl bg-card px-5 py-4 shadow-sm"
          >
            <div className="text-left">
              <p className="text-sm text-muted-foreground">More</p>
              <p className="font-medium text-foreground">Other pages &amp; reports</p>
            </div>
            {showOther ? (
              <ChevronUp className="size-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-5 text-muted-foreground" />
            )}
          </button>

          <div
            className={cn(
              "grid overflow-hidden transition-all duration-200 ease-in-out",
              showOther ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0",
            )}
          >
            <div className="overflow-hidden">
              <div className="space-y-1 rounded-2xl bg-card p-2 shadow-sm">
                {OTHER_PAGE_ITEMS.map(({ to, label, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                  >
                    <Icon className="size-4 text-muted-foreground" />
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
