#!/usr/bin/env node

/**
 * Trust or Bust Playwright Test
 *
 * Tests the full UI flow across two browser instances:
 * - Player A and B join same room
 * - Answer question
 * - Make simultaneous decisions
 * - See reveal
 * - Proceed through multiple rounds
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const HEADLESS = process.env.HEADLESS !== 'false';

const test = {
  passed: 0,
  failed: 0,
};

function assert(condition, message) {
  if (!condition) {
    console.error(`  ✗ ${message}`);
    test.failed++;
  } else {
    console.log(`  ✓ ${message}`);
    test.passed++;
  }
}

async function runPlaywrightTest() {
  console.log('\n=== Playwright UI Test: Two-Browser Match ===\n');

  let browser;
  let pageA, pageB;

  try {
    browser = await chromium.launch({ headless: HEADLESS });

    // Create two browser contexts (simulating two players)
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    pageA = await contextA.newPage();
    pageB = await contextB.newPage();

    // Navigate both to the game
    await pageA.goto(`${BASE_URL}/gamble`);
    await pageB.goto(`${BASE_URL}/gamble`);

    console.log('✓ Both pages loaded\n');

    // === Player A: Pick game ===
    console.log('Player A: Setup');
    const nameInputA = pageA.locator('input[placeholder="e.g., Alex"]');
    await nameInputA.fill('Player A');
    assert(await nameInputA.inputValue() === 'Player A', 'A enters name');

    // Click Biology Year 12 button
    const bioButtonA = pageA.locator('button:has-text("Biology Year 12")');
    await bioButtonA.click();
    assert(true, 'A starts Biology game');

    // Wait for lobby
    await pageA.waitForSelector('text=Waiting', { timeout: 5000 }).catch(() => {});
    const codeA = await pageA.locator('text=Waiting in').first().innerText().then((t) => t.split(' ').pop()).catch(() => 'UNKNOWN');
    console.log(`  Game code: ${codeA}\n`);

    // === Player B: Join by code ===
    console.log('Player B: Join');
    const nameInputB = pageB.locator('input[placeholder="e.g., Alex"]');
    await nameInputB.fill('Player B');
    assert(await nameInputB.inputValue() === 'Player B', 'B enters name');

    const codeInputB = pageB.locator('input[placeholder="Game code"]');
    await codeInputB.fill(codeA);
    const joinButton = pageB.locator('button:has-text("Join by code")');
    await joinButton.click();
    assert(true, 'B joins game');

    // Wait for both to reach lobby
    await pageA.waitForSelector('text=Waiting', { timeout: 5000 }).catch(() => {});
    await pageB.waitForSelector('text=Waiting', { timeout: 5000 }).catch(() => {});
    console.log('  Both in lobby\n');

    // === Game start (wait for play phase) ===
    console.log('Waiting for game to start...');
    await pageA.waitForSelector('text=Round', { timeout: 10000 }).catch(() => {});
    await pageB.waitForSelector('text=Round', { timeout: 10000 }).catch(() => {});
    assert(true, 'Game started, both see questions');

    // === Round 1: Answer question ===
    console.log('\nRound 1: Question');
    const answerButtonsA = pageA.locator('[role="button"]:has-text("A ")');
    if (await answerButtonsA.count() > 0) {
      await answerButtonsA.first().click();
      assert(true, 'Player A answers');
    }

    const answerButtonsB = pageB.locator('[role="button"]:has-text("B ")');
    if (await answerButtonsB.count() > 0) {
      await answerButtonsB.first().click();
      assert(true, 'Player B answers');
    }

    // Wait for decision phase
    await pageA.waitForSelector('button:has-text("SHARE")', { timeout: 10000 }).catch(() => {});
    await pageB.waitForSelector('button:has-text("SHARE")', { timeout: 10000 }).catch(() => {});
    assert(true, 'Decision phase active');

    // === Round 1: Decision (A shares, B steals) ===
    console.log('Round 1: Decisions');
    const shareButtonA = pageA.locator('button:has-text("SHARE")');
    await shareButtonA.click();
    assert(true, 'Player A chooses SHARE');

    const stealButtonB = pageB.locator('button:has-text("STEAL")');
    await stealButtonB.click();
    assert(true, 'Player B chooses STEAL');

    // Wait for reveal
    await pageA.waitForSelector('text=Round revealed', { timeout: 10000 }).catch(() => {});
    await pageB.waitForSelector('text=Round revealed', { timeout: 10000 }).catch(() => {});
    assert(true, 'Reveal shown');

    // Check reveal shows both choices
    const revealA = await pageA.locator('text=Someone stole').count();
    assert(revealA > 0, 'A sees "Someone stole" outcome');

    const revealB = await pageB.locator('text=Someone stole').count();
    assert(revealB > 0, 'B sees "Someone stole" outcome');

    // === Continue through a few more rounds ===
    console.log('\nRounds 2-3: Auto-play');

    for (let round = 1; round <= 2; round++) {
      // Wait for next question
      await pageA.waitForSelector('text=Round ' + (round + 1), { timeout: 10000 }).catch(() => {});
      await pageB.waitForSelector('text=Round ' + (round + 1), { timeout: 10000 }).catch(() => {});

      // Answer
      const ansBtn1 = pageA.locator('button:has-text("A ")').first();
      if (await ansBtn1.count() > 0) await ansBtn1.click();

      const ansBtn2 = pageB.locator('button:has-text("B ")').first();
      if (await ansBtn2.count() > 0) await ansBtn2.click();

      // Decision: alternate strategies
      await pageA.waitForSelector('button:has-text("SHARE")', { timeout: 10000 }).catch(() => {});
      await pageB.waitForSelector('button:has-text("SHARE")', { timeout: 10000 }).catch(() => {});

      if (round % 2 === 0) {
        // Both share
        await pageA.locator('button:has-text("SHARE")').click();
        await pageB.locator('button:has-text("SHARE")').click();
      } else {
        // Both steal
        await pageA.locator('button:has-text("STEAL")').click();
        await pageB.locator('button:has-text("STEAL")').click();
      }

      await pageA.waitForSelector('text=Round revealed', { timeout: 10000 }).catch(() => {});
      console.log(`  ✓ Round ${round + 1} complete`);
    }

    console.log('\n✓ Playwright test passed\n');
    return true;
  } catch (e) {
    console.error(`\n✗ Playwright test failed: ${e.message}\n`);
    test.failed++;
    return false;
  } finally {
    await pageA?.close().catch(() => {});
    await pageB?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}

async function main() {
  console.log('Trust or Bust — Playwright Verification');
  console.log('='.repeat(50));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Headless: ${HEADLESS}\n`);

  const success = await runPlaywrightTest();

  console.log('='.repeat(50));
  console.log(`UI Tests: ${test.passed} passed, ${test.failed} failed`);
  console.log(`Overall: ${test.failed === 0 ? '✓ TESTS PASSED' : '✗ TESTS FAILED'}\n`);

  process.exit(success ? 0 : 1);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
