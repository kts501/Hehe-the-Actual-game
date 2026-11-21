import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HD4600Governor, type GovernorRenderConfig } from './hd4600Governor.ts';

function feedFrames(
  gov: HD4600Governor,
  dtSec: number,
  totalMs: number,
  onConfig: (cfg: GovernorRenderConfig) => void,
): void {
  const stepMs = dtSec * 1000;
  const count = Math.ceil(totalMs / stepMs);
  for (let i = 0; i < count; i++) {
    gov.sampleFrame(dtSec, onConfig);
  }
}

describe('HD4600Governor', () => {
  it('starts at Tier 0 on Intel integrated and steps down through Tiers 1-3 under >31.5ms load', () => {
    const gov = new HD4600Governor({
      rendererString: 'Intel(R) HD Graphics 4600',
      isSoftwareGl: false,
      isIntelIntegrated: true,
    });

    assert.equal(gov.config.tier, 0);
    assert.equal(gov.config.pixelRatio, 1.0);
    assert.equal(gov.config.foliageCullMeters, 38);
    assert.equal(gov.config.pomMaxMeters, 12);
    assert.equal(gov.config.shadowDistance, 75);
    assert.equal(gov.config.shadowRefreshInterval, 2);

    const transitions: GovernorRenderConfig[] = [];
    // Simulate sustained 36ms frames (exceeding 31.5ms ceiling) across ~6 seconds
    feedFrames(gov, 0.036, 6500, (cfg) => transitions.push(cfg));

    assert.equal(transitions.length, 3);
    assert.deepEqual(
      transitions.map((t) => t.tier),
      [1, 2, 3],
    );
    assert.equal(gov.config.tier, 3);
    assert.equal(gov.config.pixelRatio, 0.667);
    assert.equal(gov.config.foliageCullMeters, 22);
    assert.equal(gov.config.pomMaxMeters, 0);
    assert.equal(gov.config.shadowDistance, 40);
    assert.equal(gov.config.sunShaftsEnabled, false);
    assert.equal(gov.config.bloomEnabled, false);
    assert.equal(gov.config.useDirectForward, true);
  });

  it('recovers one tier only after 3.5s of sustained <26.5ms headroom (hysteresis)', () => {
    const gov = new HD4600Governor({
      rendererString: 'Intel(R) HD Graphics 4600',
      isSoftwareGl: false,
      isIntelIntegrated: true,
    });

    // Drop to Tier 1 (1500ms cooldown starts)
    feedFrames(gov, 0.035, 600, () => {});
    assert.equal(gov.config.tier, 1);

    // Clear cooldown + 2s of fast 20ms frames -> still not enough for 3.5s recovery window
    let recovered = false;
    feedFrames(gov, 0.02, 3200, () => {
      recovered = true;
    });
    assert.equal(recovered, false);
    assert.equal(gov.config.tier, 1);

    // Additional 2.5s of fast 20ms frames completes >=3.5s recovery -> restores Tier 0
    feedFrames(gov, 0.02, 2600, () => {
      recovered = true;
    });
    assert.equal(recovered, true);
    assert.equal(gov.config.tier, 0);
  });

  it('locks software WebGL safely to direct forward with zero POM/bloom/sunShafts', () => {
    const gov = new HD4600Governor({
      rendererString: 'Google SwiftShader',
      isSoftwareGl: true,
      isIntelIntegrated: false,
    });

    assert.equal(gov.config.tier, 3);
    assert.equal(gov.currentPixelRatio, 1.0);
    assert.equal(gov.config.pomMaxMeters, 0);
    assert.equal(gov.config.sunShaftsEnabled, false);
    assert.equal(gov.config.bloomEnabled, false);
    assert.equal(gov.config.useDirectForward, true);
    assert.equal(gov.shouldUpdateShadows(true), false);

    let fired = false;
    feedFrames(gov, 0.045, 3000, () => {
      fired = true;
    });
    assert.equal(fired, false);
  });

  it('renders shadow map on frame 0 and throttles every 2nd frame on Intel integrated', () => {
    const gov = new HD4600Governor({
      rendererString: 'Intel(R) HD Graphics 4600',
      isSoftwareGl: false,
      isIntelIntegrated: true,
    });

    const pattern = [
      gov.shouldUpdateShadows(false),
      gov.shouldUpdateShadows(false),
      gov.shouldUpdateShadows(false),
      gov.shouldUpdateShadows(false),
    ];
    assert.deepEqual(pattern, [true, false, true, false]);
  });
});
