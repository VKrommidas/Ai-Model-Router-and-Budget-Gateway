import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cosineSimilarity } from '../services/router-logic.js';

describe('Vector Cosine Similarity Engine', () => {
  test('returns 1.0 for identical vectors', () => {
    const vecA = [0.5, 0.5, 0.5, 0.5];
    const vecB = [0.5, 0.5, 0.5, 0.5];
    const sim = cosineSimilarity(vecA, vecB);
    assert.ok(Math.abs(sim - 1.0) < 0.0001, `Expected ~1.0, got ${sim}`);
  });

  test('returns 0.0 for perfectly orthogonal vectors', () => {
    const vecA = [1.0, 0.0, 0.0];
    const vecB = [0.0, 1.0, 0.0];
    const sim = cosineSimilarity(vecA, vecB);
    assert.strictEqual(sim, 0.0);
  });

  test('returns -1.0 for opposite vectors', () => {
    const vecA = [1.0, 2.0, 3.0];
    const vecB = [-1.0, -2.0, -3.0];
    const sim = cosineSimilarity(vecA, vecB);
    assert.ok(Math.abs(sim - (-1.0)) < 0.0001, `Expected ~ -1.0, got ${sim}`);
  });

  test('detects high semantic similarity above 0.90 threshold', () => {
    // Vector A and slightly perturbed Vector B
    const vecA = [0.8, 0.6, 0.1];
    const vecB = [0.79, 0.61, 0.1];
    const sim = cosineSimilarity(vecA, vecB);
    assert.ok(sim >= 0.90, `Expected similarity >= 0.90, got ${sim}`);
  });

  test('rejects low similarity below 0.90 threshold', () => {
    const vecA = [0.9, 0.1, 0.0];
    const vecB = [0.1, 0.9, 0.0];
    const sim = cosineSimilarity(vecA, vecB);
    assert.ok(sim < 0.90, `Expected similarity < 0.90, got ${sim}`);
  });

  test('safely handles empty or null vectors without division by zero', () => {
    assert.strictEqual(cosineSimilarity([], []), 0);
    assert.strictEqual(cosineSimilarity([1, 2], []), 0);
    assert.strictEqual(cosineSimilarity([0, 0, 0], [0, 0, 0]), 0);
  });
});

