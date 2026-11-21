import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CameraSpringRig,
  classifyLandingImpact,
  classifySurfaceType,
  computeMuscleUpStage,
  computeStrideGait,
  computeVaultKinematics,
} from './parkourPhysics';

test('CameraSpringRig produces damped impulse response and decays to zero', () => {
  const rig = new CameraSpringRig();
  rig.addImpulse(-0.25, 0.12, -0.35, 0.08);

  let peakPitch = 0;
  let peakDrop = 0;
  for (let i = 0; i < 20; i++) {
    const s = rig.step(1 / 60);
    if (Math.abs(s.pitch) > Math.abs(peakPitch)) peakPitch = s.pitch;
    if (Math.abs(s.posY) > Math.abs(peakDrop)) peakDrop = s.posY;
    assert.ok(Number.isFinite(s.pitch) && Number.isFinite(s.posY));
  }
  assert.ok(peakPitch < -0.05, `expected noticeable negative pitch kick, got ${peakPitch}`);
  assert.ok(peakDrop < -0.05, `expected noticeable negative dropY, got ${peakDrop}`);

  // Run for 2.0 seconds; rig should settle near 0
  for (let i = 0; i < 120; i++) {
    rig.step(1 / 60);
  }
  assert.ok(Math.abs(rig.state.pitch) < 0.01);
  assert.ok(Math.abs(rig.state.posY) < 0.01);
  assert.ok(Math.abs(rig.state.roll) < 0.01);

  // Handles dt=0 and large dt safely without NaNs
  const before = { ...rig.state };
  rig.step(0);
  assert.deepEqual(rig.state, before);
  rig.step(0.07);
  assert.ok(Number.isFinite(rig.state.pitch) && Number.isFinite(rig.state.posY));
});

test('classifyLandingImpact handles all 4 tiers accurately', () => {
  const light = classifyLandingImpact(6.5, false, false);
  assert.equal(light.tier, 'LIGHT');
  assert.equal(light.damage, 0);
  assert.equal(light.stunDuration, 0);

  const cushion = classifyLandingImpact(22.0, false, true);
  assert.equal(cushion.tier, 'LIGHT');
  assert.equal(cushion.damage, 0);

  const heavy = classifyLandingImpact(13.0, false, false);
  assert.equal(heavy.tier, 'HEAVY_BRACE');
  assert.equal(heavy.stunDuration, 0.65);

  const roll = classifyLandingImpact(14.5, true, false);
  assert.equal(roll.tier, 'PARKOUR_ROLL');
  assert.equal(roll.damage, 0);
  assert.equal(roll.stunDuration, 0);

  const critical = classifyLandingImpact(19.5, false, false);
  assert.equal(critical.tier, 'CRITICAL_IMPACT');
  assert.equal(critical.stunDuration, 1.4);
  assert.ok(critical.damage >= 24);
});

test('computeMuscleUpStage progresses cleanly through 4 anatomical stages', () => {
  const s1 = computeMuscleUpStage(0.08, 1.15);
  assert.equal(s1.stage, 1);
  assert.equal(s1.fingerPose, 'CRIMP_LEDGE');
  assert.ok(s1.camPitchOffset < -0.05);

  const s2 = computeMuscleUpStage(0.45, 1.15);
  assert.equal(s2.stage, 2);
  assert.equal(s2.fingerPose, 'CRIMP_LEDGE');
  assert.ok(s2.rightThighX > 1.0, `expected +85 deg right knee drive, got ${s2.rightThighX}`);

  const s3 = computeMuscleUpStage(0.75, 1.15);
  assert.equal(s3.stage, 3);
  assert.equal(s3.fingerPose, 'FLAT_PUSH');
  assert.ok(s3.leftThighX < -0.3, `expected -40 deg counterbalance kick, got ${s3.leftThighX}`);

  const s4 = computeMuscleUpStage(1.15, 1.15);
  assert.equal(s4.stage, 4);
  assert.equal(s4.fingerPose, 'FLAT_PUSH');
  assert.equal(s4.forwardProgress, 1);
});

test('computeStrideGait differentiates idle, sprint, slide, roll, and heavy landing', () => {
  const idle = computeStrideGait(0, false, 0, 'GROUNDED');
  const sprint = computeStrideGait(12.5, false, Math.PI * 0.5, 'GROUNDED');
  assert.ok(Math.abs(sprint.leftThighX) > Math.abs(idle.leftThighX));
  assert.ok(sprint.hipBobY <= 0);

  const slide = computeStrideGait(10, false, 0, 'SLIDE');
  assert.ok(slide.hipBobY < -0.3);
  assert.ok(slide.leftThighX > 0.8);

  const roll = computeStrideGait(8, false, 0, 'PARKOUR_ROLL');
  assert.ok(roll.leftKneeX > 1.7 && roll.rightKneeX > 1.7);

  const heavy = computeStrideGait(0, false, 0, 'HEAVY_LANDING');
  assert.ok(heavy.leftKneeX > 2.0 && heavy.rightKneeX > 2.0);
});

test('computeVaultKinematics distinguishes SPEED_VAULT and KONG_VAULT', () => {
  const speed = computeVaultKinematics('SPEED_VAULT', 0.5);
  assert.ok(speed.leftHandPlant > 0.9);
  assert.equal(speed.rightHandPlant, 0);
  assert.ok(speed.camRollRad < -0.1);

  const kong = computeVaultKinematics('KONG_VAULT', 0.5);
  assert.ok(kong.leftHandPlant > 0.9 && kong.rightHandPlant > 0.9);
  assert.equal(kong.camRollRad, 0);
  assert.ok(kong.leftKneeX > 1.7 && kong.rightKneeX > 1.7);
});

test('classifySurfaceType identifies concrete, wood, and metal colliders', () => {
  assert.equal(classifySurfaceType('wood_plank_bridge'), 'wood');
  assert.equal(classifySurfaceType('scaffold_ramp_1'), 'wood');
  assert.equal(classifySurfaceType('train_coach_roof'), 'metal');
  assert.equal(classifySurfaceType('water_tank_tower'), 'metal');
  assert.equal(classifySurfaceType('taj_courtyard_floor'), 'concrete');
  assert.equal(classifySurfaceType(undefined), 'concrete');
});
