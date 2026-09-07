export type SpeedMode = "1x" | "10x" | "100x" | "live";

export interface SimulatorArgs {
  participant: string;
  speed: SpeedMode;
  apiUrl: string;
  duplicateRate: number;
  dropRate: number;
  delayMs: number;
  killAfter: number | undefined;
  dataDir: string;
}

const SPEED_MULTIPLIER: Record<Exclude<SpeedMode, "live">, number> = {
  "1x": 1,
  "10x": 10,
  "100x": 100,
};

export function speedMultiplier(mode: SpeedMode): number {
  return mode === "live" ? 1 : SPEED_MULTIPLIER[mode];
}

/**
 * Minimal flag parser — deliberately not a dependency. Supports
 * `--flag=value` and `--flag value`.
 *
 * Example: npm run simulator -- --participant=001 --speed=10x
 */
export function parseArgs(argv: string[]): SimulatorArgs {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg?.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      flags.set(arg.slice(2, eq), arg.slice(eq + 1));
    } else {
      const value = argv[i + 1];
      if (value && !value.startsWith("--")) {
        flags.set(arg.slice(2), value);
        i++;
      } else {
        flags.set(arg.slice(2), "true");
      }
    }
  }

  const participant = flags.get("participant") ?? "001";
  const speed = (flags.get("speed") ?? "10x") as SpeedMode;
  if (!["1x", "10x", "100x", "live"].includes(speed)) {
    throw new Error(`Invalid --speed "${speed}". Expected one of: 1x, 10x, 100x, live`);
  }

  return {
    participant,
    speed,
    apiUrl: flags.get("api-url") ?? process.env["INGESTION_API_URL"] ?? "http://localhost:3000/api/readings",
    duplicateRate: Number(flags.get("duplicate-rate") ?? "0"),
    dropRate: Number(flags.get("drop-rate") ?? "0"),
    delayMs: Number(flags.get("delay-ms") ?? "0"),
    killAfter: flags.has("kill-after") ? Number(flags.get("kill-after")) : undefined,
    dataDir: flags.get("data-dir") ?? "../../../data/normalized",
  };
}
