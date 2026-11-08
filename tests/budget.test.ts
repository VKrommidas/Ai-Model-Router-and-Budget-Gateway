import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRoutingDecision } from '../services/router-logic.js';

describe('FinOps Budget Enforcer & Circuit Breaker', () => {
  test('routes easy query to cheap tier when budget is healthy', () => {
    // spend: $1.00, limit: $50.00 (2% usage), difficulty: 0.20
    const decision = evaluateRoutingDecision(0.20, 1.00, 50.00, 0.60);
    assert.strictEqual(decision.tier, 'cheap');
    assert.strictEqual(decision.isSuspended, false);
    assert.strictEqual(decision.isFrugalityMode, false);
  });

  test('routes complex query to expert tier when budget is healthy', () => {
    // spend: $5.00, limit: $50.00 (10% usage), difficulty: 0.85
    const decision = evaluateRoutingDecision(0.85, 5.00, 50.00, 0.60);
    assert.strictEqual(decision.tier, 'expert');
    assert.strictEqual(decision.isSuspended, false);
    assert.strictEqual(decision.isFrugalityMode, false);
  });

  test('activates aggressive frugality (>90% spend) and forces complex query to cheap tier', () => {
    // spend: $46.00, limit: $50.00 (92% usage), difficulty: 0.95 (normally expert)
    const decision = evaluateRoutingDecision(0.95, 46.00, 50.00, 0.60);
    assert.strictEqual(decision.tier, 'cheap', 'Must force cheap tier under frugality mode');
    assert.strictEqual(decision.isSuspended, false);
    assert.strictEqual(decision.isFrugalityMode, true);
  });

  test('triggers hard suspension (HTTP 402) when budget is 100% exhausted', () => {
    // spend: $50.00, limit: $50.00 (100% usage)
    const decision = evaluateRoutingDecision(0.10, 50.00, 50.00, 0.60);
    assert.strictEqual(decision.isSuspended, true);
  });

  test('triggers hard suspension when spending exceeds limit (>100%)', () => {
    // spend: $50.15, limit: $50.00 (100.3% usage)
    const decision = evaluateRoutingDecision(0.50, 50.15, 50.00, 0.60);
    assert.strictEqual(decision.isSuspended, true);
  });

  test('handles zero or negative budget safely without crashing', () => {
    const decision = evaluateRoutingDecision(0.20, 0, 0, 0.60);
    assert.strictEqual(typeof decision.isSuspended, 'boolean');
  });
});

