type ClassValue = string | number | bigint | boolean | undefined | null | ClassValue[];

function flattenClasses(values: ClassValue[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    if (value == null || value === false || value === true) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
      out.push(String(value));
    } else if (Array.isArray(value)) {
      out.push(...flattenClasses(value));
    }
  }
  return out;
}

export function cn(...inputs: ClassValue[]) {
  return flattenClasses(inputs).join(" ");
}

export function formatInr(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}
