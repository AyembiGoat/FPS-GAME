import { describe, expect, it } from 'vitest';
import {
  ATTACHMENT_LIST,
  ATTACHMENT_SLOTS,
  attachmentFit,
  ATTACHMENTS,
  attachmentSummary,
  sanitizeAttachments,
} from './attachments';
import { AWM, DP_28, HK416, KAR98K, M1911, REMINGTON_870, SAIGA_12, WEAPONS } from './weapon';

describe('attachment catalogue', () => {
  it('defines twelve parts across the four slots, each with a compatibility list', () => {
    expect(ATTACHMENT_LIST).toHaveLength(12);
    expect(new Set(ATTACHMENT_LIST.map((a) => a.id)).size).toBe(12);
    for (const part of ATTACHMENT_LIST) {
      expect(ATTACHMENT_SLOTS).toContain(part.slot);
      expect(part.name.length).toBeGreaterThan(0);
      expect(part.description.length).toBeGreaterThan(0);
      expect(part.compatibility.length).toBeGreaterThan(0);
      expect(Object.keys(part.modifiers).length).toBeGreaterThan(0);
    }
  });

  it('restricts grips to assault rifles and SMGs and stocks to marksman and sniper rifles', () => {
    for (const part of ATTACHMENT_LIST) {
      if (part.slot === 'grip') expect([...part.compatibility]).toEqual(['assault', 'smg']);
      if (part.slot === 'buttstock') expect([...part.compatibility]).toEqual(['dmr', 'sniper']);
    }
    expect([...ATTACHMENTS.choke.compatibility]).toEqual(['shotgun']);
  });

  it('gives every weapon at least one fitting part per slot it has', () => {
    for (const weapon of WEAPONS) {
      for (const slot of weapon.attachmentSlots) {
        const fitting = ATTACHMENT_LIST.filter(
          (part) => part.slot === slot && attachmentFit(weapon, part).fits,
        );
        expect(fitting.length, `${weapon.id} ${slot}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('attachment fit', () => {
  it('explains in plain words why a part does not fit', () => {
    expect(attachmentFit(HK416, ATTACHMENTS.compensator)).toEqual({ fits: true });
    expect(attachmentFit(HK416, ATTACHMENTS.choke)).toEqual({
      fits: false,
      reason: 'Fits shotguns only',
    });
    expect(attachmentFit(AWM, ATTACHMENTS['vertical-foregrip'])).toEqual({
      fits: false,
      reason: 'AWM has no rail under the barrel',
    });
    expect(attachmentFit(HK416, ATTACHMENTS['cheek-pad'])).toEqual({
      fits: false,
      reason: 'HK416 has a fixed stock',
    });
    expect(attachmentFit(KAR98K, ATTACHMENTS['extended-mag'])).toEqual({
      fits: false,
      reason: 'Kar98k has a fixed magazine',
    });
    expect(attachmentFit(DP_28, ATTACHMENTS.suppressor)).toEqual({
      fits: false,
      reason: 'DP-28 has no threaded muzzle',
    });
    expect(attachmentFit(M1911, ATTACHMENTS.compensator)).toEqual({
      fits: false,
      reason: 'Fits assault rifles, submachine guns, marksman rifles and sniper rifles only',
    });
    expect(attachmentFit(REMINGTON_870, ATTACHMENTS.choke).fits).toBe(true);
    expect(attachmentFit(SAIGA_12, ATTACHMENTS['extended-mag']).fits).toBe(true);
  });

  it('sanitises saved data: unknown ids, wrong slots and misfits are dropped', () => {
    expect(sanitizeAttachments(HK416, undefined)).toEqual({});
    expect(sanitizeAttachments(HK416, 'nonsense')).toEqual({});
    expect(
      sanitizeAttachments(HK416, {
        muzzle: 'suppressor',
        grip: 'extended-mag',
        magazine: 'not-a-part',
        buttstock: 'cheek-pad',
        extra: 'compensator',
      }),
    ).toEqual({ muzzle: 'suppressor' });
  });

  it('summarises fitted parts in slot order', () => {
    expect(
      attachmentSummary({
        magazine: 'extended-mag',
        muzzle: 'suppressor',
        grip: 'angled-foregrip',
      }),
    ).toEqual(['Suppressor', 'Angled Grip', 'Extended Mag']);
    expect(attachmentSummary({})).toEqual([]);
  });
});
