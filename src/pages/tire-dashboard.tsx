import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Package, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { readDb } from "@/lib/db";
import { formatInr } from "@/lib/utils";
import { STAGE_LABELS, type Tire, type TireStage } from "@/types/tire";

export default function TireDashboard() {
  const [tires, setTires] = useState<Tire[]>([]);

  useEffect(() => {
    const db = readDb();
    setTires((db.tires as Tire[]) || []);
  }, []);

  const stageCounts = useMemo(() => {
    const counts: Record<TireStage, number> = {
      production: 0,
      "quality-check": 0,
      warehouse: 0,
      dispatch: 0,
      dealer: 0,
      mounted: 0,
      retread: 0,
      scrapped: 0,
    };
    for (const tire of tires) {
      counts[tire.currentStage]++;
    }
    return Object.entries(counts).map(([stage, count]) => ({
      stage: STAGE_LABELS[stage as TireStage],
      count,
    }));
  }, [tires]);

  const stats = useMemo(() => {
    const active = tires.filter((t) => t.status === "active").length;
    const sold = tires.filter((t) => t.status === "sold").length;
    const scrapped = tires.filter((t) => t.status === "scrapped").length;
    const inventoryValue = tires
      .filter((t) => t.status !== "scrapped")
      .reduce((sum, t) => sum + t.costPrice, 0);
    return { active, sold, scrapped, inventoryValue };
  }, [tires]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Tire Tracking</h1>
        <p className="text-muted-foreground">Monitor tires as they move from production to end-of-life.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Package} label="Active tires" value={stats.active.toString()} />
        <StatCard icon={Truck} label="Sold / mounted" value={stats.sold.toString()} />
        <StatCard icon={ShieldCheck} label="Scrapped" value={stats.scrapped.toString()} />
        <StatCard icon={RotateCcw} label="Inventory value" value={formatInr(stats.inventoryValue)} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h2 className="text-lg font-medium text-foreground mb-4">Tires by stage</h2>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stageCounts} margin={{ top: 8, right: 16, left: 8, bottom: 32 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="stage"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                angle={-30}
                textAnchor="end"
                height={50}
              />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))" }}
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.75rem",
                }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                itemStyle={{ color: "hsl(var(--primary))" }}
              />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} animationDuration={1200} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Package; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm flex items-center gap-4">
      <div className="rounded-xl bg-primary/10 p-3 text-primary">
        <Icon className="size-6" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}
