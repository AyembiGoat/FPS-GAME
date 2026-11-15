import { describe, expect, it } from 'vitest';
import { applyArmour, applyDamage, ARMOUR_TUNING, createArmour, NO_ARMOUR } from './damage';

describe('armour', () => {
  it('creates vests with pools of 200/220/250 and matching helmets', () => {
    expect(createArmour(1, 0).vestDurability).toBe(200);
    expect(createArmour(2, 0).vestDurability).toBe(220);
    expect(createArmour(3, 0).vestDurability).toBe(250);
    expect(createArmour(0, 2)).toEqual({
      vest: 0,
      vestDurability: 0,
      helmet: 2,
      helmetDurability: ARMOUR_TUNING.helmetDurability[2],
    });
    expect(createArmour(9, -1)).toEqual(createArmour(3, 0));
  });

  it('absorbs 30/40/55% by level', () => {
    expect(applyArmour(createArmour(1, 0), 50, 'torso', 0).healthDamage).toBeCloseTo(35, 9);
    expect(applyArmour(createArmour(2, 0), 50, 'torso', 0).healthDamage).toBeCloseTo(30, 9);
    expect(applyArmour(createArmour(3, 0), 50, 'torso', 0).healthDamage).toBeCloseTo(22.5, 9);
    expect(applyArmour(createArmour(0, 1), 50, 'head', 0).healthDamage).toBeCloseTo(35, 9);
    expect(applyArmour(createArmour(0, 3), 50, 'head', 0).healthDamage).toBeCloseTo(22.5, 9);
  });

  it('protects the body with the vest only and the head with the helmet only', () => {
    const vestOnly = createArmour(3, 0);
    expect(applyArmour(vestOnly, 50, 'head', 0).healthDamage).toBe(50);
    expect(applyArmour(vestOnly, 50, 'legs', 0).healthDamage).toBe(50);
    const helmetOnly = createArmour(0, 3);
    expect(applyArmour(helmetOnly, 50, 'torso', 0).healthDamage).toBe(50);
    const struck = applyArmour(createArmour(2, 2), 40, 'torso', 0);
    expect(struck.piece).toBe('vest');
    expect(struck.armour.helmetDurability).toBe(ARMOUR_TUNING.helmetDurability[2]);
    expect(struck.armour.vestDurability).toBe(180);
  });

  it('lets armour-piercing rounds ignore part of the protection', () => {
    const plain = applyArmour(createArmour(3, 0), 100, 'torso', 0);
    const piercing = applyArmour(createArmour(3, 0), 100, 'torso', 0.5);
    expect(plain.healthDamage).toBeCloseTo(45, 9);
    expect(piercing.healthDamage).toBeCloseTo(72.5, 9);
    expect(applyArmour(createArmour(3, 0), 100, 'torso', 1).healthDamage).toBe(100);
  });

  it('breaks when its pool runs out and then stops protecting', () => {
    let armour = createArmour(1, 0);
    let broken = null;
    let hits = 0;
    while (armour.vest > 0) {
      const result = applyArmour(armour, 60, 'torso', 0);
      armour = result.armour;
      broken = result.broken;
      hits++;
    }
    expect(hits).toBe(4); // 200 points of durability against 60-damage hits
    expect(broken).toBe('vest');
    expect(armour).toEqual(NO_ARMOUR);
    expect(applyArmour(armour, 60, 'torso', 0).healthDamage).toBe(60);
  });

  it('only protects the share of a hit that its remaining pool covers', () => {
    const worn = { ...createArmour(1, 0), vestDurability: 20 };
    const result = applyArmour(worn, 80, 'torso', 0);
    // A quarter of the hit is covered: 80 × 0.25 × 0.3 = 6 absorbed.
    expect(result.absorbed).toBeCloseTo(6, 9);
    expect(result.healthDamage).toBeCloseTo(74, 9);
    expect(result.broken).toBe('vest');
  });

  it('never removes more health than the target has', () => {
    const result = applyDamage({ health: 12, maxHealth: 100, armour: NO_ARMOUR }, 80, 'torso', 0);
    expect(result.healthLost).toBe(12);
    expect(result.health).toBe(0);
    expect(result.killed).toBe(true);
  });
});
