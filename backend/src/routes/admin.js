import { Router } from "express";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const router = Router();

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../../data");
const SETTINGS_FILE = resolve(DATA_DIR, "settings.json");

const DEFAULT_SETTINGS = {
  presetAmounts: [10, 50, 100],
  recurringOptions: [
    { value: "one_time", label: "One time" },
    { value: "weekly",   label: "Weekly" },
    { value: "monthly",  label: "Monthly" },
    { value: "annually", label: "Annually" }
  ]
};

function readSettings() {
  try {
    return JSON.parse(readFileSync(SETTINGS_FILE, "utf-8"));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(data) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

router.get("/settings", (_req, res) => {
  res.json(readSettings());
});

router.post("/settings", (req, res) => {
  const { presetAmounts } = req.body;

  if (
    !Array.isArray(presetAmounts) ||
    presetAmounts.length === 0 ||
    !presetAmounts.every((a) => Number.isFinite(Number(a)) && Number(a) >= 1)
  ) {
    return res.status(400).json({ error: "presetAmounts must be a non-empty array of numbers ≥ 1." });
  }

  const current = readSettings();
  const cleaned = { ...current, presetAmounts: presetAmounts.map(Number).slice(0, 10) };
  writeSettings(cleaned);
  res.json({ ok: true, presetAmounts: cleaned.presetAmounts });
});

export default router;
