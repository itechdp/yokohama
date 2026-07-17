import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, Save, UploadCloud } from "lucide-react";
import { readDb, writeDb } from "@/lib/db";
import type { Tire, TireStage } from "@/types/tire";

export default function TireNew() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    material: "",
    tireDescriptionBrand: "",
    plyRatingBottom: "",
    brand: "",
  });

  const update = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const db = readDb();
    const tires: Tire[] = db.tires || [];
    const now = new Date().toISOString();
    const id = `t-${Date.now()}`;

    const newTire: Tire = {
      id,
      serialNumber: form.material.trim() || id,
      model: form.tireDescriptionBrand.trim() || "Unknown model",
      size: "Unknown size",
      productionDate: now.split("T")[0],
      currentStage: "production" as TireStage,
      location: "Plant",
      status: "active" as Tire["status"],
      notes: "",
      warrantyMonths: 60,
      costPrice: 0,
      plyRatingBottom: form.plyRatingBottom.trim(),
      brand: form.brand.trim(),
      createdAt: now,
      updatedAt: now,
    };

    writeDb({ ...db, tires: [...tires, newTire] });
    navigate("/tires");
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back
      </button>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Add new tire</h1>
          <p className="text-muted-foreground">Record a tire as it enters production.</p>
        </div>
        <Link
          to="/tires/bulk-upload"
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors shrink-0"
        >
          <UploadCloud className="size-4" />
          Bulk upload
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Material" value={form.material} onChange={(v) => update("material", v)} required />
          <Field
            label="Tire Description-Brand"
            value={form.tireDescriptionBrand}
            onChange={(v) => update("tireDescriptionBrand", v)}
            required
          />
          <Field
            label="Ply Rating Bottom"
            value={form.plyRatingBottom}
            onChange={(v) => update("plyRatingBottom", v)}
            required
          />
          <Field label="Brand" value={form.brand} onChange={(v) => update("brand", v)} required />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Save className="size-4" /> Save tire
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}
