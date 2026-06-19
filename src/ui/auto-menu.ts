// @ts-nocheck
// TUI for editing the "Auto" model ranking: the sort SOURCE (manual + whatever
// the provider offers — recommended/leaderboard/custom) plus which models are
// included and, in manual mode, their order. Fully generic over the sources the
// provider advertises; manual is always available.

import { select } from "./select.js";
import { getAutoConfig, setAutoConfig } from "../config.js";
import { readModelCache } from "./../models-cache.js";

function displayName(providerId, id) {
  const cache = readModelCache(providerId);
  const entry = cache && cache.models && cache.models[id];
  return (entry && entry.name) || id;
}

async function editModel(providerId, id, source) {
  const { order, excluded } = getAutoConfig(providerId);
  const included = !excluded.includes(id);
  const pos = order.indexOf(id);

  const items = [
    { label: "Back", value: { type: "back" } },
    { label: included ? "Exclude" : "Include", value: { type: "toggle" }, color: included ? "yellow" : "green" },
  ];
  if (source === "manual") {
    items.push({ label: "Move up", value: { type: "up" } });
    items.push({ label: "Move down", value: { type: "down" } });
  }
  const r = await select(items, {
    message: displayName(providerId, id),
    subtitle: source === "manual" ? "" : "Order is automatic in this mode; switch to Manual to reorder.",
    clearScreen: true,
  });
  if (!r || r.type === "back") return;

  if (r.type === "toggle") {
    setAutoConfig(providerId, { excluded: included ? [...excluded, id] : excluded.filter((x) => x !== id) });
  } else if (r.type === "up" && pos > 0) {
    const next = order.slice(); [next[pos - 1], next[pos]] = [next[pos], next[pos - 1]];
    setAutoConfig(providerId, { order: next });
  } else if (r.type === "down" && pos >= 0 && pos < order.length - 1) {
    const next = order.slice(); [next[pos + 1], next[pos]] = [next[pos], next[pos + 1]];
    setAutoConfig(providerId, { order: next });
  }
}

export async function runAutoMenu(def) {
  const providerId = def.id;
  while (true) {
    const { order, excluded, source, sources } = getAutoConfig(providerId);
    if (!order.length) {
      await select([{ label: "Back", value: { type: "back" } }], {
        message: def.label + " — Auto", subtitle: "No models yet. Sign in first, then configure Auto.", clearScreen: true,
      });
      return;
    }
    const current = sources.find((s) => s.id === source) || sources[0];

    const items = [
      { label: "Done", value: { type: "done" } },
      { label: "Sort: " + (current ? current.label : source), value: { type: "source" }, color: "cyan" },
    ];
    if (source === "manual") items.push({ label: "Reset to default order", value: { type: "reset" }, color: "yellow" });
    items.push({ label: "", value: { type: "noop" }, separator: true });
    items.push({ label: "Models (top = preferred)", value: { type: "noop" }, kind: "heading" });
    order.forEach((id, i) => {
      const inc = !excluded.includes(id);
      items.push({ label: (inc ? "[x] " : "[ ] ") + (i + 1) + ". " + displayName(providerId, id), hint: inc ? "" : "excluded", value: { type: "model", id } });
    });

    const sub = source === "manual"
      ? "Tries these top-to-bottom, skipping rate-limited ones. Enter a model to reorder/include."
      : "Order is automatic (" + (current ? current.label : source) + "). Enter a model to include/exclude.";
    const r = await select(items, { message: def.label + " — Auto model ranking", subtitle: sub, clearScreen: true });
    if (!r || r.type === "done" || r.type === "noop") return;
    if (r.type === "reset") { setAutoConfig(providerId, { order: [] }); continue; }
    if (r.type === "source") {
      const idx = sources.findIndex((s) => s.id === source);
      const next = sources[(idx + 1) % sources.length];
      setAutoConfig(providerId, { source: next.id });   // sort orders are precomputed/cached by core
      continue;
    }
    if (r.type === "model") await editModel(providerId, r.id, source);
  }
}
