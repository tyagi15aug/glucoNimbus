export interface SimulatorStats {
  sent: number;
  successful: number;
  failed: number;
  duplicated: number;
  dropped: number;
}

export function newStats(): SimulatorStats {
  return { sent: 0, successful: 0, failed: 0, duplicated: 0, dropped: 0 };
}

export function renderStatsPanel(participant: string, speed: string, stats: SimulatorStats): string {
  // Deliberately plain-text — the spec's mocked box (Section 5) is a
  // developer-facing terminal panel, not something worth a TUI library for.
  return [
    "┌─────────────────────────────────────┐",
    "│ CGM Simulator                        │",
    "│                                       │",
    `│ Participant: ${participant.padEnd(24)}│`,
    `│ Speed:       ${speed.padEnd(24)}│`,
    "│                                       │",
    `│ Readings sent:       ${String(stats.sent).padStart(9)} │`,
    `│ Successful:          ${String(stats.successful).padStart(9)} │`,
    `│ Failed:              ${String(stats.failed).padStart(9)} │`,
    `│ Duplicated:          ${String(stats.duplicated).padStart(9)} │`,
    `│ Dropped:             ${String(stats.dropped).padStart(9)} │`,
    "└─────────────────────────────────────┘",
  ].join("\n");
}
