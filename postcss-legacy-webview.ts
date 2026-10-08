import type { AtRule, Declaration, PluginCreator } from "postcss";

// Fallbacks so Tailwind v4's output still renders on older Android WebViews
// (warehouse tablets that never got a WebView update). Runs after cascade
// layers have been flattened (see vite.config.ts).
//
// 1. Tailwind v4 positions/animates with the individual `translate`, `scale`
//    and `rotate` properties, which need Chrome 104+. Older engines ignore
//    them, so e.g. icons centred with `-translate-y-1/2` drop half their
//    height. For those engines only (`@supports not (translate: 0)`), repeat
//    the same values as a classic `transform`.
// 2. Tailwind gives its --tw-* variables default values via @property, with a
//    plain `*, ::before, ::after` fallback that it only enables for old
//    Safari/Firefox. Enable that fallback for the same old engines too, or
//    every utility built on those variables (transforms, shadows, rings)
//    resolves to an invalid value there.
// 3. Logical shorthands like `padding-inline` (px-*) and `inset-inline` need
//    Chrome 87+, and Lightning CSS only lowers them when the value has no
//    var() - which Tailwind's spacing always has. The app is left-to-right
//    only, so rewrite them as the equivalent physical properties.

const TRANSFORM_PROPS = ["translate", "scale", "rotate"] as const;

const LOGICAL_SIDES: Record<string, [string, string]> = {
  inline: ["left", "right"],
  block: ["top", "bottom"],
};
const LOGICAL_EDGES: Record<string, string> = {
  "inline-start": "left",
  "inline-end": "right",
  "block-start": "top",
  "block-end": "bottom",
};
const LOGICAL_PROP = /^(margin|padding|inset|scroll-margin|scroll-padding)-(inline|block)(?:-(start|end))?$/;

function physical(base: string, side: string): string {
  return base === "inset" ? side : `${base}-${side}`;
}

// Split "var(--a) var(--b)" on top-level whitespace only.
function splitArgs(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of value.trim()) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (current) parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function toTransform(decl: Declaration): string | null {
  const args = splitArgs(decl.value);
  if (args.length === 0 || args[0] === "none") return null;
  if (decl.prop === "rotate") return `rotate(${args[0]})`;
  return `${decl.prop}(${args.join(", ")})`;
}

const legacyWebview: PluginCreator<void> = () => ({
  postcssPlugin: "legacy-webview",
  OnceExit(root, { AtRule }) {
    root.walkAtRules("supports", (atRule) => {
      if (atRule.params.includes("-webkit-hyphens")) {
        atRule.params = `${atRule.params} or (not (translate: 0))`;
      }
    });

    root.walkDecls((decl) => {
      if (decl.prop === "inset") {
        const [t, r = t, b = t, l = r] = splitArgs(decl.value);
        decl.cloneBefore({ prop: "top", value: t });
        decl.cloneBefore({ prop: "right", value: r });
        decl.cloneBefore({ prop: "bottom", value: b });
        decl.cloneBefore({ prop: "left", value: l });
        decl.remove();
        return;
      }

      const match = LOGICAL_PROP.exec(decl.prop);
      if (!match) return;
      const [, base, axis, edge] = match;
      if (edge) {
        decl.prop = physical(base, LOGICAL_EDGES[`${axis}-${edge}`]);
        return;
      }
      const [start, end = start] = splitArgs(decl.value);
      const [startSide, endSide] = LOGICAL_SIDES[axis];
      decl.cloneBefore({ prop: physical(base, startSide), value: start });
      decl.cloneBefore({ prop: physical(base, endSide), value: end });
      decl.remove();
    });

    root.walkRules((rule) => {
      if (rule.parent?.type === "atrule" && (rule.parent as AtRule).name.endsWith("keyframes")) return;

      const transforms: string[] = [];
      rule.each((node) => {
        if (node.type !== "decl") return;
        if (!(TRANSFORM_PROPS as readonly string[]).includes(node.prop)) return;
        const transform = toTransform(node);
        if (transform) transforms.push(transform);
      });
      if (transforms.length === 0) return;

      const fallback = rule.clone({ nodes: [] });
      fallback.append({ prop: "transform", value: transforms.join(" ") });
      const supports = new AtRule({ name: "supports", params: "not (translate: 0)" });
      supports.append(fallback);
      rule.after(supports);
    });
  },
});
legacyWebview.postcss = true;

export default legacyWebview;
