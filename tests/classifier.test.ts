import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateHeuristicDifficulty, blendDifficulty } from '../services/router-logic.js';

describe('Complexity Classifier & Heuristics', () => {
  test('assigns baseline difficulty (0.1) for simple greeting', () => {
    const score = calculateHeuristicDifficulty('Hello there, how are you?');
    assert.strictEqual(score, 0.1);
  });

  test('adds +0.2 weight for explanation and analysis keywords', () => {
    const score = calculateHeuristicDifficulty('Explain the concept of entropy.');
    assert.strictEqual(score, 0.3); // 0.1 baseline + 0.2
  });

  test('adds +0.4 weight for coding and debugging keywords', () => {
    const score = calculateHeuristicDifficulty('Write a python function to debug memory.');
    assert.strictEqual(score, 0.5); // 0.1 baseline + 0.4
  });

  test('adds +0.3 weight for step-by-step reasoning keywords', () => {
    const score = calculateHeuristicDifficulty('Give me step-by-step reasoning for this riddle.');
    assert.strictEqual(score, 0.4); // 0.1 baseline + 0.3
  });

  test('adds +0.3 weight for long queries (>500 characters)', () => {
    const longPrompt = 'A'.repeat(550);
    const score = calculateHeuristicDifficulty(longPrompt);
    assert.strictEqual(score, 0.4); // 0.1 baseline + 0.3
  });

  test('combines multiple signals for complex technical prompts', () => {
    const complexPrompt = 'Write a step-by-step Python function to analyze and debug a memory leak, and explain the code.';
    const score = calculateHeuristicDifficulty(complexPrompt);
    // 0.1 baseline + 0.4 (function/debug) + 0.3 (step-by-step) + 0.2 (explain/analyze) = 1.0 (clamped)
    assert.strictEqual(score, 1.0);
  });

  test('clamps score strictly between 0.0 and 1.0', () => {
    assert.ok(calculateHeuristicDifficulty('') >= 0.0);
    assert.ok(calculateHeuristicDifficulty('code debug analyze explain reasoning function step-by-step ' + 'x'.repeat(600)) <= 1.0);
  });

  test('blends heuristic score (30%) with LLM meta-score (70%) accurately', () => {
    // heuristic 0.2, LLM 0.8 -> (0.2 * 0.3) + (0.8 * 0.7) = 0.06 + 0.56 = 0.62
    const blended = blendDifficulty(0.2, 0.8);
    assert.ok(Math.abs(blended - 0.62) < 0.001, `Expected 0.62, got ${blended}`);
  });
});

