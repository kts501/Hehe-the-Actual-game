import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  computeScaledResolution,
  computeSunScreenProjection,
  createCrysisShaderUniforms,
} from './crysisShaders.ts';

describe('crysisShaders math & configuration', () => {
  it('disables POM when isSoftwareGl is true and enables 12m POM on hardware GL', () => {
    const sw = createCrysisShaderUniforms(true);
    const hw = createCrysisShaderUniforms(false);
    assert.equal(sw.uPomMaxDist.value, 0);
    assert.equal(hw.uPomMaxDist.value, 12);
    assert.equal(hw.uFoliageLodStart.value, 28);
    assert.equal(hw.uFoliageLodEnd.value, 38);
  });

  it('projects centered sun direction when camera looks toward sun and fades to zero when facing away', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
    camera.position.set(0, 5, 0);
    const sunDir = new THREE.Vector3(0, 0.35, -1).normalize();

    camera.lookAt(0, 5 + 0.35 * 100, -100);
    camera.updateMatrixWorld();
    const facingSun = computeSunScreenProjection(camera, sunDir, 1.0);
    assert.ok(Math.abs(facingSun.screenX - 0.5) < 0.05);
    assert.ok(facingSun.visibility > 0.7);

    camera.lookAt(0, 5, 100);
    camera.updateMatrixWorld();
    const awayFromSun = computeSunScreenProjection(camera, sunDir, 1.0);
    assert.equal(awayFromSun.visibility, 0);

    camera.lookAt(0, 5 + 0.35 * 100, -100);
    camera.updateMatrixWorld();
    const zeroSun = computeSunScreenProjection(camera, sunDir, 0);
    assert.equal(zeroSun.visibility, 0);
  });

  it('computes clamped integer internal render resolution for HD 4600 scaling tiers', () => {
    const full = computeScaledResolution(1920, 1080, 1.0);
    assert.deepEqual(full, { width: 1920, height: 1080, pixelCount: 1920 * 1080 });

    const tier3 = computeScaledResolution(1920, 1080, 0.667);
    assert.equal(tier3.height, 720);
    assert.equal(tier3.width, 1281);

    const clampedUp = computeScaledResolution(1280, 720, 2.0);
    assert.equal(clampedUp.width, 1280);
    assert.equal(clampedUp.height, 720);

    const clampedMin = computeScaledResolution(320, 180, 0.1);
    assert.equal(clampedMin.width, 320);
    assert.equal(clampedMin.height, 180);
  });
});
