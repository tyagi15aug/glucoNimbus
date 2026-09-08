/**
 * Phase 6 reliability demonstration (spec Section 5) — developer-toggled
 * failure injection at the ingestion and processing boundaries. A rule's
 * mere existence in this table means it's active; deleting the row turns
 * it off. No separate `enabled` column — nothing else in this schema
 * soft-deletes, and a row that outlives its purpose is just clutter to
 * remove, not state to track. See docs/adr/0013-failure-injection.md.
 */
import type { Pool } from "pg";
import { pool } from "./index";

export type FailureScope = "ingestion" | "processing";
export type FailureType = "error" | "delay" | "db_outage";

export interface FailureRule {
  id: string;
  scope: FailureScope;
  failureType: FailureType;
  delayMs: number | null;
  probability: number;
  createdAt: string;
}

interface FailureRuleRow {
  id: string;
  scope: FailureScope;
  failure_type: FailureType;
  delay_ms: number | null;
  probability: number;
  created_at: Date;
}

function toFailureRule(row: FailureRuleRow): FailureRule {
  return {
    id: row.id,
    scope: row.scope,
    failureType: row.failure_type,
    delayMs: row.delay_ms,
    probability: row.probability,
    createdAt: row.created_at.toISOString(),
  };
}

/** Every active rule, optionally filtered to one scope — the enforcement points (ingestion route, processReading) always pass a scope; the /developer panel calls it with none to show everything at once. */
export async function listFailureRules(scope?: FailureScope, target: Pool = pool): Promise<FailureRule[]> {
  const result = scope
    ? await target.query<FailureRuleRow>(
        `SELECT id, scope, failure_type, delay_ms, probability, created_at FROM failure_rules WHERE scope = $1 ORDER BY created_at DESC`,
        [scope],
      )
    : await target.query<FailureRuleRow>(
        `SELECT id, scope, failure_type, delay_ms, probability, created_at FROM failure_rules ORDER BY created_at DESC`,
      );
  return result.rows.map(toFailureRule);
}

export interface CreateFailureRuleInput {
  scope: FailureScope;
  failureType: FailureType;
  delayMs?: number | undefined;
  probability?: number | undefined;
}

export async function createFailureRule(input: CreateFailureRuleInput, target: Pool = pool): Promise<FailureRule> {
  const result = await target.query<FailureRuleRow>(
    `INSERT INTO failure_rules (scope, failure_type, delay_ms, probability)
     VALUES ($1, $2, $3, $4)
     RETURNING id, scope, failure_type, delay_ms, probability, created_at`,
    [input.scope, input.failureType, input.delayMs ?? null, input.probability ?? 1.0],
  );
  const row = result.rows[0];
  if (!row) throw new Error("createFailureRule: insert returned no row");
  return toFailureRule(row);
}

/** True if a row was actually deleted — lets the route return 404 instead of a silent no-op for an already-gone id. */
export async function deleteFailureRule(id: string, target: Pool = pool): Promise<boolean> {
  const result = await target.query(`DELETE FROM failure_rules WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}
