import test from 'node:test';
import assert from 'node:assert/strict';
import { createGate } from '../src/gate.js';

function clock() {
  let t = 1_000_000;
  return { now: () => t, advance: (ms) => (t += ms) };
}

test('free attempts, then a doubling delay capped at the maximum', () => {
  const c = clock();
  const gate = createGate({}, c.now);
  for (let i = 0; i < 4; i++) {
    gate.fail('d1', '1.1.1.1');
    assert.equal(gate.retryAfter('d1', '1.1.1.1'), 0);
  }
  gate.fail('d1', '1.1.1.1'); // 5th wrong attempt
  assert.equal(gate.retryAfter('d1', '1.1.1.1'), 2000);
  c.advance(2000);
  assert.equal(gate.retryAfter('d1', '1.1.1.1'), 0);
  gate.fail('d1', '1.1.1.1');
  assert.equal(gate.retryAfter('d1', '1.1.1.1'), 4000);
  for (let i = 0; i < 20; i++) gate.fail('d1', '1.1.1.1');
  assert.equal(gate.retryAfter('d1', '1.1.1.1'), 15 * 60 * 1000);
});

test('the delay is per drop and IP: another address is not locked out', () => {
  const gate = createGate({}, clock().now);
  for (let i = 0; i < 10; i++) gate.fail('d1', 'attacker');
  assert.ok(gate.retryAfter('d1', 'attacker') > 0);
  assert.equal(gate.retryAfter('d1', 'recipient'), 0);
  assert.equal(gate.retryAfter('d2', 'attacker'), 0);
});

test('an IP failing across many drops is slowed down too', () => {
  const gate = createGate({}, clock().now);
  for (let i = 0; i < 30; i++) gate.fail(`drop-${i}`, '2.2.2.2');
  assert.ok(gate.retryAfter('fresh-drop', '2.2.2.2') > 0);
});

test('counters reset after an hour without failures and on success', () => {
  const c = clock();
  const gate = createGate({}, c.now);
  for (let i = 0; i < 6; i++) gate.fail('d1', 'ip');
  assert.ok(gate.retryAfter('d1', 'ip') > 0);
  c.advance(60 * 60 * 1000 + 1);
  assert.equal(gate.retryAfter('d1', 'ip'), 0);
  for (let i = 0; i < 6; i++) gate.fail('d1', 'ip');
  gate.succeed('d1', 'ip');
  assert.equal(gate.retryAfter('d1', 'ip'), 0); // drop counter cleared; 6 per-IP failures are under the IP limit
  c.advance(60 * 60 * 1000 + 1);
  gate.sweep();
  assert.equal(gate.size(), 0);
});
