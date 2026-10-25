/* ════════════════════════════════════════════════════════════════════
   characters/animator.js
   Procedural animation for the low-poly rig built by lowpoly.js.

   What changed vs. the old _animate() in thirdperson.js
   ─────────────────────────────────────────────────────
   1. FOOT-PLANTED GAIT. Legs are driven by 2-bone IK from a foot path
      (stance = foot slides back at ground speed, swing = smooth Hermite arc),
      and the cycle rate is derived from the REAL ground speed. No more
      moon-walking / floating feet, and it stops when you push into a wall.
   2. POSE BLENDING. Every frame a *target* pose is built, then every joint
      is eased toward it (frame-rate independent), so state changes
      (stand→sit, walk→emote, jump→land…) flow instead of snapping.
   3. ACCURATE EMOTES. Wave / clap / flex / meditate / dance were solved
      with forward-kinematics against the real bone lengths: hands meet in the
      clap, the waving palm faces forward beside the head, the flex is a proper
      double-biceps with fists, meditation sits on the floor with knees
      down and hands on knees, dance bounces on a beat with planted feet.
   4. Hands: finger curl is part of the pose (open, fist, peace, point …).
   5. Landing squash, lean into turns / acceleration, idle breathing.

   This file has NO three.js import on purpose (it only touches
   joint.rotation / joint.position), so it can be unit-tested in node.
   Controller contract: see the "ctl fields used" list at animate().
   ════════════════════════════════════════════════════════════════════ */

const PI = Math.PI, TAU = PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const wrap1 = (u) => u - Math.floor(u);

/* rig measurements (must match lowpoly.js) */
export const HIP_HEIGHT = 0.935;
const L1 = 0.42, L2 = 0.40;          // thigh, shin
const PIVOT = -0.010;                // hip pivot y relative to hips group
const ANKLE_H = 0.105;               // ankle height when the foot is flat on the ground
const STAND_LEN = 0.818;             // pivot→ankle distance when standing relaxed
const CROUCH_LEN = 0.633;
const RELAX_WRIST = 1.2;             // hanging hand: thumb forward, palm toward the leg

/* heights used by the controller (kept for compatibility) */
export const HIPS_STAND = HIP_HEIGHT;
export const HIPS_MEDITATE = 0.20;

/* ── emote table (durations unchanged from the old controller) ─── */
export const EMOTES = {
  wave:     { dur: 3.0, label: "\uD83D\uDC4B WAVING" },
  clap:     { dur: 3.0, label: "\uD83D\uDC4F CLAPPING" },
  flex:     { dur: 3.0, label: "\uD83D\uDCAA FLEXING" },
  meditate: { dur: 4.0, label: "\uD83E\uDDD8 MEDITATING" },
  dance:    { dur: 5.0, label: "\uD83D\uDD7A DANCING" },
};

/* ── hand shapes: curl for [index, middle, ring, pinky] + thumb ─── */
export const HAND = {
  relaxed: { c: [0.16, 0.20, 0.26, 0.30], t: 0.12 },
  open:    { c: [0.02, 0.02, 0.04, 0.06], t: 0.00 },
  fist:    { c: [1, 1, 1, 1], t: 1 },
  peace:   { c: [0, 0, 1, 1], t: 0.7 },
  point:   { c: [0, 1, 1, 1], t: 0.9 },
  thumbs:  { c: [1, 1, 1, 1], t: 0 },
  mudra:   { c: [0.55, 0.12, 0.16, 0.20], t: 0.55 },
};

/* ── selfie poses (same keys / order as before, now with hand shapes) ─── */
export const SELFIE_POSES = {
  neutral: { emoji:"\uD83D\uDE10", label:"Neutral", short:"NEUTRAL", hand:"relaxed", apply:function(R){ R.head.rotation.z=0; R.head.rotation.y=0; R.spine.rotation.x=0; R.spine.rotation.z=0; } },
  smile:   { emoji:"\uD83D\uDE0A", label:"Smile",   short:"SMILE",   hand:"relaxed", apply:function(R){ R.head.rotation.z=-0.08; R.head.rotation.y=-0.05; R.spine.rotation.z=0.02; R.armL.shoulder.rotation.set(-0.35,0,-0.25); R.armL.elbow.rotation.set(-0.9,0,0); } },
  peace:   { emoji:"\u270C\uFE0F", label:"Peace",   short:"PEACE",   hand:"peace",   apply:function(R){ R.armL.shoulder.rotation.set(-2.05,-0.15,0.30); R.armL.elbow.rotation.set(-2.25,0,0); R.armL.wrist.rotation.set(0.15,0,0); R.head.rotation.z=0.10; R.head.rotation.y=-0.08; R.spine.rotation.z=-0.04; } },
  wave:    { emoji:"\uD83D\uDC4B", label:"Wave",    short:"WAVE",    hand:"open",    apply:function(R){ R.armL.shoulder.rotation.set(-2.20,0,0.55); R.armL.elbow.rotation.set(-0.45,0,0); R.armL.wrist.rotation.set(0.35,0,-0.20); R.head.rotation.y=0.15; R.spine.rotation.z=0.03; } },
  flex:    { emoji:"\uD83D\uDCAA", label:"Flex",    short:"FLEX",    hand:"fist",    apply:function(R){ R.armL.shoulder.rotation.set(-1.00,0,1.30); R.armL.elbow.rotation.set(-2.20,0,0); R.spine.rotation.x=-0.06; R.spine.rotation.z=0.02; R.head.rotation.z=0.05; } },
  kiss:    { emoji:"\uD83D\uDE18", label:"Kiss",    short:"KISS",    hand:"open",    apply:function(R){ R.armL.shoulder.rotation.set(-1.55,-0.30,0.10); R.armL.elbow.rotation.set(-2.35,0,0); R.armL.wrist.rotation.set(0.10,0.15,0); R.head.rotation.z=0.12; R.head.rotation.y=0.10; R.spine.rotation.z=0.03; } },
  thumbs:  { emoji:"\uD83D\uDC4D", label:"Thumbs",  short:"THUMBS",  hand:"thumbs",  apply:function(R){ R.armL.shoulder.rotation.set(-1.30,0,0.35); R.armL.elbow.rotation.set(-0.65,0,0); R.armL.wrist.rotation.set(-0.30,0,0); R.spine.rotation.z=0.02; R.head.rotation.z=-0.03; } },
  point:   { emoji:"\uD83D\uDC49", label:"Point",   short:"POINT",   hand:"point",   apply:function(R){ R.armL.shoulder.rotation.set(-1.60,0,0.15); R.armL.elbow.rotation.set(-0.15,0,0); R.armL.wrist.rotation.set(-0.20,0,0); R.head.rotation.y=-0.05; R.spine.rotation.z=0.02; } },
};
export const SELFIE_POSE_ORDER = ["neutral","smile","peace","wave","flex","kiss","thumbs","point"];

/* Apply a finger shape to one arm of the rig (side: +1 = left, -1 = right).
   Same curl convention as lowpoly.js setGrip(). Rig finger order is fixed in
   x, so the index finger is f0 on the left hand and f3 on the right. */
export function setHand(arm, side, shape) {
  if (!arm || !arm.fingers) return;
  const s = typeof shape === "string" ? HAND[shape] : shape;
  for (let f = 0; f < 4; f++) {
    const c = s.c[side > 0 ? f : 3 - f];
    arm.fingers[f].group.rotation.x = c * PI * 0.55;
    arm.fingers[f].midJoint.rotation.x = c * PI * 0.60;
  }
  if (arm.thumb) {
    arm.thumb.rotation.x = -s.t * 0.40;
    arm.thumb.rotation.z = -side * s.t * 0.70;
  }
}
/* helper for the controller's selfie overlay */
export function applySelfieHand(R, poseName) {
  const p = SELFIE_POSES[poseName];
  if (p && p.hand) setHand(R.armL, +1, p.hand);
}

/* ═══════════════ 2-bone leg IK (sagittal plane) ═══════════════
   Input : ankle position relative to the hip pivot (ty ≤ 0 is below, tz forward)
   Output: thigh / knee rotation.x (knee ≥ 0 bends the shin backward)       */
export function legIK(ty, tz, out) {
  out = out || {};
  let d = Math.hypot(ty, tz);
  const dmax = (L1 + L2) * 0.9995;
  if (d > dmax) { const k = dmax / d; ty *= k; tz *= k; d = dmax; }
  if (d < 0.14) { const k = 0.14 / Math.max(d, 1e-6); ty *= k; tz *= k; d = 0.14; }
  const psi = Math.atan2(-tz, -ty);
  const knee = PI - Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
  const beta = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  out.thigh = psi - beta;
  out.knee = knee;
  return out;
}

/* ═══════════════ pose container ═══════════════ */
function newPose() {
  return {
    hips: [0, 0, 0], hipsPos: [0, HIP_HEIGHT, 0],
    spine: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
    aL: { sh: [0, 0, 0], el: [0, 0, 0], wr: [0, RELAX_WRIST, 0] },
    aR: { sh: [0, 0, 0], el: [0, 0, 0], wr: [0, -RELAX_WRIST, 0] },
    lL: { hip: [0, 0, 0], knee: [0, 0, 0], ank: [0, 0, 0] },
    lR: { hip: [0, 0, 0], knee: [0, 0, 0], ank: [0, 0, 0] },
    hL: HAND.relaxed, hR: HAND.relaxed,
  };
}
const set3 = (a, x, y, z) => { a[0] = x; a[1] = y; a[2] = z; };

/* Plant both feet with IK for a given pelvis height (flat feet, optional lift/forward offsets) */
const _ik = {};
function plantLeg(leg, hipsY, footZ, lift, extraAnkle) {
  const ty = (ANKLE_H + (lift || 0)) - (hipsY + PIVOT);
  legIK(ty, footZ || 0, _ik);
  set3(leg.hip, _ik.thigh, 0, 0);
  set3(leg.knee, _ik.knee, 0, 0);
  set3(leg.ank, -(_ik.thigh + _ik.knee) + (extraAnkle || 0), 0, 0);
}

/* ═══════════════ persistent animation state ═══════════════ */
function newState() {
  return {
    rig: null, init: false,
    px: 0, pz: 0, havePos: false, speed: 0, acc: 0, lastSpeed: 0,
    yaw: 0, yawRate: 0, haveYaw: false,
    u: 0, moveAmt: 0, runAmt: 0,
    airborne: false, lastVy: 0, land: 0,
    key: "", bs: 1,
    useTotal: 1.2, lastUse: 0,
    idleT: 0, breathT: 0,
    S: null, SH: [0, HIP_HEIGHT, 0], joints: null,
  };
}

/* all joints that get blended (cached per rig) */
function collectJoints(R) {
  const J = [R.hips, R.spine, R.neck, R.head];
  for (const arm of [R.armL, R.armR]) {
    J.push(arm.shoulder, arm.elbow, arm.wrist);
    if (arm.thumb) J.push(arm.thumb);
    if (arm.fingers) for (const f of arm.fingers) J.push(f.group, f.midJoint);
  }
  for (const leg of [R.legL, R.legR]) J.push(leg.hip, leg.knee, leg.ank || leg.ankle);
  return J.filter(Boolean);
}

/* ═══════════════ locomotion (IK gait) ═══════════════ */
const _fp = { z: 0, lift: 0, ank: 0, w: 0, len: 0 };
/* foot path for one leg. u in [0,1): 0 = heel strike. Returns into _fp */
function footPath(u, d, S, vrel, f, hc, lenBase) {
  if (u < d) {                                   /* ── stance ── */
    const s = u / d;
    _fp.z = lerp(S / 2, -S / 2, s);
    const pfS = sstep((s - 0.72) / 0.28);        /* heel rises late in stance */
    const pf = 0.5 * pfS;
    _fp.lift = 0.16 * Math.sin(pf);
    _fp.ank = -0.20 * (1 - sstep(s / 0.25)) + pf;
    _fp.w = sstep(s / 0.10) * (1 - sstep((s - 0.88) / 0.12));
    _fp.len = lenBase + 0.025 * Math.cos(PI * s);
  } else {                                       /* ── swing ── */
    const s = (u - d) / (1 - d);
    const Tsw = (1 - d) / Math.max(f, 1e-3);
    const m = -vrel * Tsw * 0.42;                /* partially match stance speed at both ends (full match overshoots badly) */
    const s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    _fp.z = h00 * (-S / 2) + h10 * m + h01 * (S / 2) + h11 * m;
    const pfDecay = 0.5 * (1 - sstep(s / 0.35));
    _fp.lift = 0.16 * Math.sin(pfDecay) * (1 - sstep(s / 0.35)) + hc * Math.pow(Math.sin(PI * s), 1.2);
    _fp.ank = lerp(pfDecay, -0.20, sstep(s)) - 0.12 * Math.sin(PI * s);
    _fp.w = 0;
    _fp.len = lenBase;
  }
  return _fp;
}

/* cycle parameters derived from ground speed (shared by phase accumulation + pose) */
function gaitParams(v, runAmt, crouching) {
  const d = lerp(0.62, 0.38, runAmt);                          /* duty factor (fraction of cycle on the ground) */
  const S = clamp(0.40 + 0.17 * v, 0.40, 1.05) * (crouching ? 0.85 : 1);   /* ankle travel (m) during stance */
  const rock = lerp(0.22, 0.10, runAmt);                       /* extra ankle travel over the ground: heel→toe roll */
  const f = (v * d) / (S + rock);                              /* cycle frequency, Hz */
  return { d, S, rock, f, vrel: (S * f) / d };
}

function locomotion(a, ctl, P, crouching) {
  const v = a.speed, runAmt = a.runAmt, mv = a.moveAmt;
  const baseLen = crouching ? CROUCH_LEN : STAND_LEN;

  /* idle / loco blend of pelvis height */
  let gaitLen = crouching ? CROUCH_LEN + 0.01 : lerp(0.800, 0.765, runAmt);
  const landDip = 0.17 * a.land;

  /* cycle parameters from speed */
  const { d, S, f, vrel } = gaitParams(v, runAmt, crouching);
  const hc = lerp(0.05, 0.16, runAmt) * (crouching ? 0.6 : 1);

  const uL = a.u, uR = wrap1(a.u + 0.5);
  const snap = (p) => ({ z: p.z, lift: p.lift, ank: p.ank, w: p.w, len: p.len });
  const pl = [snap(footPath(uL, d, S, vrel, f, hc, gaitLen)), snap(footPath(uR, d, S, vrel, f, hc, gaitLen))];

  /* pelvis height: follows the stance leg(s); in flight rises to an apex */
  let wsum = 0, hsum = 0;
  for (const p of pl) {
    const l = Math.min(p.len, 0.8198);
    const hreq = ANKLE_H + p.lift + Math.sqrt(Math.max(l * l - p.z * p.z, 0.04));
    wsum += p.w; hsum += p.w * hreq;
  }
  const apex = ANKLE_H + gaitLen * 0.995 + 0.025 * runAmt;
  const ff = 1 - Math.min(1, wsum);
  const pivotGait = wsum > 1e-4 ? lerp(hsum / wsum, apex, ff) : apex;
  const pivotStand = ANKLE_H + baseLen - landDip;
  const pivot = lerp(pivotStand, pivotGait - landDip * mv, mv);
  const hipsY = pivot - PIVOT;
  P.hipsPos[1] = hipsY;

  /* legs: blend standing IK and gait IK */
  const sides = [[P.lL, pl[0]], [P.lR, pl[1]]];
  for (const [leg, p] of sides) {
    plantLeg(leg, hipsY, 0, 0, 0);                      /* standing */
    const sx = [leg.hip[0], leg.knee[0], leg.ank[0]];
    const ty = (ANKLE_H + p.lift) - (hipsY + PIVOT);
    legIK(ty, p.z, _ik);
    const gx = [_ik.thigh, _ik.knee, -(_ik.thigh + _ik.knee) + p.ank];
    leg.hip[0] = lerp(sx[0], gx[0], mv);
    leg.knee[0] = lerp(sx[1], gx[1], mv);
    leg.ank[0] = lerp(sx[2], gx[2], mv);
  }

  /* arms swing opposite to the same-side leg */
  const cL = Math.cos(TAU * uL), cR = Math.cos(TAU * uR);
  const armAmp = lerp(0.28, 0.95, sstep((v - 0.6) / 4.2)) * mv;
  const flexB = lerp(0.22, 1.20, runAmt);
  for (const [arm, c, side] of [[P.aL, cL, 1], [P.aR, cR, -1]]) {
    arm.sh[0] = c * armAmp;
    arm.sh[2] = side * (0.07 + 0.05 * runAmt);
    arm.el[0] = -(0.12 + (flexB - 0.12) * mv + 0.35 * runAmt * Math.max(0, -c) * mv);
  }

  /* torso: counter-rotation, forward lean, bob */
  const lean = (0.03 + 0.17 * runAmt) * mv + clamp(a.acc * 0.012, -0.06, 0.10) + 0.55 * a.land;
  const twist = cL * mv;
  P.hips[1] = -0.08 * twist;
  P.spine[0] = lean;
  P.spine[1] = 0.17 * twist;
  P.spine[2] = -clamp(a.yawRate * 0.045, -0.18, 0.18) * (0.35 + 0.65 * runAmt) * Math.max(mv, 0.25);
  P.head[0] = -lean * 0.75;
  P.head[1] = -(P.hips[1] + P.spine[1]) * 0.9 + clamp(a.yawRate * 0.05, -0.25, 0.25);
  if (crouching) { P.spine[0] += 0.22; P.head[0] -= 0.12; }
  P.hips[2] = 0.025 * Math.sin(TAU * uL) * mv;           /* gentle pelvis roll */
}

/* idle micro-motion (breathing, weight settle, head look) added on top of the standing pose */
function idleLayer(a, P, amt) {
  const b = Math.sin(a.breathT * 1.7);
  P.spine[0] += b * 0.014 * amt;
  P.aL.sh[2] += b * 0.012 * amt; P.aR.sh[2] -= b * 0.012 * amt;
  P.head[1] += Math.sin(a.idleT * 0.45) * 0.14 * amt;
  P.head[0] += Math.sin(a.idleT * 0.31 + 1.0) * 0.03 * amt;
  P.hips[2] += Math.sin(a.idleT * 0.35) * 0.012 * amt;
}

/* ═══════════════ airborne ═══════════════ */
function airPose(a, ctl, P) {
  const vy = ctl.vel ? ctl.vel.y : 0;
  const j = (clamp(vy / 4.0, -1, 1) + 1) * 0.5;       /* 1 = rising, 0 = falling */
  const th = [-0.30 + (-0.88 + 0.30) * j, -0.30 + (-0.88 + 0.30) * j];
  const kn = [0.35 + (1.30 - 0.35) * j, 0.35 + (1.30 - 0.35) * j];
  th[0] += -0.18; th[1] += 0.24; kn[0] += 0.28; kn[1] += -0.16;
  const an = -0.16 + (0.46 + 0.16) * j;
  set3(P.lL.hip, th[0], 0, 0); set3(P.lL.knee, kn[0], 0, 0); set3(P.lL.ank, an, 0, 0);
  set3(P.lR.hip, th[1], 0, 0); set3(P.lR.knee, kn[1], 0, 0); set3(P.lR.ank, an, 0, 0);
  const sw = -0.50 + (-2.10 + 0.50) * j, el = -0.90 + (-0.35 + 0.90) * j, sp = 0.55 + (0.25 - 0.55) * j;
  set3(P.aL.sh, sw, 0, sp); set3(P.aR.sh, sw * 0.92, 0, -sp);
  set3(P.aL.el, el, 0, 0); set3(P.aR.el, el, 0, 0);
  P.hipsPos[1] = HIP_HEIGHT;
  P.spine[0] = 0.08 - 0.10 * j; P.head[0] = -0.05;
  P.hL = HAND.open; P.hR = HAND.open;
}

/* ═══════════════ seated / lying / bath ═══════════════ */
function seatedPose(a, ctl, P) {
  const st = ctl.state;
  if (st === "sitting" || st === "seated") {
    P.hipsPos[1] = HIP_HEIGHT;
    let H = 0.47;
    try {
      if (ctl.sitTarget) {
        const g = ctl._groundInfo ? ctl._groundInfo(ctl.sitTarget.x, ctl.sitTarget.z, ctl.level) : { y: 0 };
        H = ctl.sitTarget.h - g.y;
      }
    } catch (e) { /* keep default */ }
    const tz = H > 0.38 ? 0.30 : lerp(0.55, 0.30, clamp((H - 0.20) / 0.18, 0, 1));
    for (const leg of [P.lL, P.lR]) {
      legIK(-H + 0.015, tz, _ik);
      set3(leg.hip, _ik.thigh, 0, 0); set3(leg.knee, _ik.knee, 0, 0);
      set3(leg.ank, -(_ik.thigh + _ik.knee), 0, 0);
    }
    set3(P.aL.sh, -0.15, 0, 0.12); set3(P.aR.sh, -0.15, 0, -0.12);
    /* hands rest on the thighs (inward) */
    P.aL.sh[2] = -0.10; P.aR.sh[2] = 0.10;
    set3(P.aL.el, -1.45, 0, 0); set3(P.aR.el, -1.45, 0, 0);
    P.spine[0] = 0.06;
    P.hL = HAND.relaxed; P.hR = HAND.relaxed;
    idleLayer(a, P, 0.7);
  } else if (st === "lying") {
    set3(P.hips, -1.5, 0, 0);
    set3(P.spine, 1.5, 0, 0);
    P.hipsPos[1] = 0.16;
    let roll = 0, armLX = -0.04, armRX = -0.04, armLz = 0.14, armRz = -0.14;
    let elL = -0.08, elR = -0.08, hipLX = 0.02, hipRX = 0.02, kneeLX = 0.05, kneeRX = 0.05;
    switch (ctl.liePose) {
      case "side": roll = PI / 2; armLX = -0.45; armRX = -0.45; armLz = 0.05; armRz = -0.05; elL = -0.55; elR = -0.55; kneeLX = 0.55; kneeRX = 0.55; break;
      case "hand_pillow": armLX = -2.3; armLz = 0.55; elL = -1.5; armRX = -0.35; armRz = -0.05; elR = -0.9; break;
      case "hands_behind": armLX = -2.3; armLz = 0.55; elL = -1.5; armRX = -2.3; armRz = -0.55; elR = -1.5; break;
      case "curled": roll = PI / 2; hipLX = 0.85; hipRX = 0.85; kneeLX = 1.85; kneeRX = 1.85; armLX = -0.9; elL = -1.35; break;
    }
    let extra = ctl.lieRoll || 0;
    extra = Math.atan2(Math.sin(extra), Math.cos(extra));
    P.hips[1] = roll + extra;
    P.lL.hip[0] = hipLX; P.lR.hip[0] = hipRX; P.lL.knee[0] = kneeLX; P.lR.knee[0] = kneeRX;
    P.aL.sh[0] = armLX; P.aR.sh[0] = armRX; P.aL.sh[2] = armLz; P.aR.sh[2] = armRz;
    P.aL.el[0] = elL; P.aR.el[0] = elR;
    P.spine[0] += Math.sin(a.breathT * 1.3) * 0.012;
  } else if (st === "bathing") {
    P.hipsPos[1] = HIP_HEIGHT * 0.38;
    P.spine[0] = -0.35;
    P.lL.hip[0] = P.lR.hip[0] = -1.1; P.lL.knee[0] = P.lR.knee[0] = 1.6;
    P.aL.sh[0] = P.aR.sh[0] = -0.2;
    idleLayer(a, P, 0.5);
  }
}

/* ═══════════════ emotes ═══════════════
   All angles solved with FK against the real bone lengths. L arm values;
   the right arm mirrors them (y and z negate, x stays).                       */
function mirror(v) { return [v[0], -v[1], -v[2]]; }
function arms(P, shL, elL, wrL, shR, elR, wrR) {
  P.aL.sh = shL; P.aL.el = elL; P.aL.wr = wrL;
  P.aR.sh = shR || mirror(shL); P.aR.el = elR || mirror(elL); P.aR.wr = wrR || mirror(wrL);
}

/* feet planted at a given pelvis height, optional per-foot lift / forward step */
function standAt(P, ell, liftL, liftR, zL, zR) {
  const hipsY = ANKLE_H + ell - PIVOT;
  P.hipsPos[1] = hipsY;
  plantLeg(P.lL, hipsY, zL || 0, liftL || 0, 0);
  plantLeg(P.lR, hipsY, zR || 0, liftR || 0, 0);
}

const EMOTE_FN = {
  /* Right hand raised beside the head, palm toward the viewer, forearm waving. */
  wave(t, P, a) {
    const k = sstep(t / 0.35);
    const w = Math.sin(t * 9.5) * 0.38 * k;
    standAt(P, 0.812);
    P.aR.sh = [lerp(0, 0.20, k), 0, lerp(-0.07, -1.315, k)];
    P.aR.el = [0, 0, lerp(-0.12, -1.814, k) + w];
    P.aR.wr = [0, lerp(-RELAX_WRIST, 3.0, k), Math.sin(t * 9.5 + 0.8) * 0.20 * k];
    P.aL.sh = [0.04, 0, 0.09 + Math.sin(t * 1.9) * 0.01]; P.aL.el = [-0.18, 0, 0];
    P.hR = HAND.open;
    P.spine[2] = -0.03 * k + Math.sin(t * 2.0) * 0.012; P.spine[1] = 0.06 * k;
    P.head[1] = -0.18 * k; P.head[2] = 0.07 * k;
    P.hips[2] = 0.02 * k;
  },

  /* Both hands meet in front of the chest, palms facing each other, on a beat. */
  clap(t, P, a) {
    const f = 2.4, ph = wrap1(t * f);
    const cl = ph < 0.30 ? Math.pow(ph / 0.30, 1.6) : ph < 0.40 ? 1 : 1 - sstep((ph - 0.40) / 0.60);
    const open = [-0.383, 0.231, -0.102], shut = [-0.355, -0.145, -0.433];
    const elO = -1.78, elC = -1.605, wrO = 1.25, wrC = 1.25;
    const sh = [0, 1, 2].map(i => lerp(open[i], shut[i], cl));
    const raise = sstep(t / 0.3);
    const L = { sh: [lerp(-0.1, sh[0], raise), lerp(0, sh[1], raise), lerp(0.09, sh[2], raise)], el: [lerp(-0.2, lerp(elO, elC, cl), raise), 0, 0], wr: [0, lerp(RELAX_WRIST, lerp(wrO, wrC, cl), raise), 0] };
    arms(P, L.sh, L.el, L.wr);
    const hit = cl > 0.92 ? 1 : 0;
    standAt(P, 0.806 - 0.012 * hit);
    P.spine[0] = 0.04 + 0.03 * hit; P.head[0] = -0.04 - 0.03 * hit;
    P.hips[2] = Math.sin(t * f * PI) * 0.015;
    P.hL = HAND.open; P.hR = HAND.open;
  },

  /* Double-biceps: elbows out at shoulder height, forearms up, fists toward the head,
     chest out, wide stance, pulsing flex. */
  flex(t, P, a) {
    const k = sstep(t / 0.4);
    const pulse = 0.5 + 0.5 * Math.sin(t * 6.0 - 1.2);
    const sh = [lerp(0, -0.10, k) - 0.03 * pulse * k, 0, lerp(0.09, 1.50, k) + 0.04 * pulse * k];
    const el = [0, 0, lerp(0.1, 2.15, k) + 0.10 * pulse * k];
    const wr = [0, lerp(RELAX_WRIST, -1.4, k), 0];
    arms(P, sh, el, wr);
    standAt(P, 0.795);
    P.lL.hip[2] = 0.15 * k; P.lR.hip[2] = -0.15 * k;
    P.spine[0] = -0.09 * k - 0.03 * pulse * k; P.head[0] = 0.06 * k;
    P.spine[1] = Math.sin(t * 1.5) * 0.06 * k;
    P.head[2] = Math.sin(t * 1.5) * 0.05 * k;
    P.hL = HAND.fist; P.hR = HAND.fist;
  },

  /* Easy-seat: pelvis on the floor, knees out and down, shins crossed in front,
     palms up on the knees with a thumb-index mudra, slow breathing. */
  meditate(t, P, a) {
    const k = sstep(t / 0.9);
    const breath = Math.sin(t * 1.7);
    P.hipsPos[1] = lerp(HIP_HEIGHT, HIPS_MEDITATE, k);
    const hipL = [-2.4, 0.855, 1.255], kn = 2.543;
    P.lL.hip = [lerp(0, hipL[0], k), lerp(0, hipL[1], k), lerp(0, hipL[2], k)];
    P.lR.hip = [P.lL.hip[0], -P.lL.hip[1], -P.lL.hip[2]];
    P.lL.knee = [lerp(0, kn, k), 0, 0]; P.lR.knee = [P.lL.knee[0], 0, 0];
    P.lL.ank = [lerp(0, 0.35, k), 0, 0]; P.lR.ank = [P.lL.ank[0], 0, 0];
    const sh = [-0.313, 0.487, 0.126], el = [-0.81, 0, 0], wr = [0, PI, 0];
    arms(P,
      [lerp(0, sh[0], k), lerp(0, sh[1], k), lerp(0.09, sh[2], k)],
      [lerp(-0.1, el[0], k), 0, 0],
      [0, lerp(RELAX_WRIST, PI, k), 0],
      [lerp(0, sh[0], k), -lerp(0, sh[1], k), -lerp(0.09, sh[2], k)],
      [lerp(-0.1, el[0], k), 0, 0],
      [0, -lerp(RELAX_WRIST, PI, k), 0]);
    P.spine[0] = 0.05 * k + breath * 0.016 * k;
    P.head[0] = 0.07 * k + breath * 0.01; P.head[1] = Math.sin(t * 0.6) * 0.03;
    P.aL.sh[2] += breath * 0.01; P.aR.sh[2] -= breath * 0.01;
    P.hL = HAND.mudra; P.hR = HAND.mudra;
  },

  /* 120 bpm groove: bounce on the beat with planted feet, hip sway, torso twist,
     alternating foot taps. First 2 s arm-pump, next 2 s "raise the roof", then repeats. */
  dance(t, P, a) {
    const k = sstep(t / 0.4);
    const b = t * 2.0;                               /* beats */
    const down = 0.5 + 0.5 * Math.cos(TAU * b);      /* 1 on the beat */
    const sway = Math.sin(PI * b);
    const ell = 0.806 - 0.055 * down * k;
    const liftL = Math.max(0, sway) * 0.045 * k, liftR = Math.max(0, -sway) * 0.045 * k;
    standAt(P, ell, liftL, liftR, 0.02 * Math.max(0, sway) * k, 0.02 * Math.max(0, -sway) * k);
    P.hipsPos[0] = sway * 0.035 * k;
    P.hips[1] = -sway * 0.20 * k; P.hips[2] = sway * 0.05 * k;
    P.spine[1] = sway * 0.32 * k; P.spine[0] = 0.05 * k + 0.04 * down * k; P.spine[2] = -sway * 0.05 * k;
    P.head[0] = -0.04 + 0.07 * (1 - down) * k; P.head[1] = -(P.hips[1] + P.spine[1]) * 0.8; P.head[2] = sway * 0.07 * k;
    const phrase = Math.floor(t / 2) % 2;
    if (phrase === 0) {                              /* arm pump */
      const pumpL = Math.sin(PI * b), pumpR = -pumpL;
      arms(P,
        [-0.85 + pumpL * 0.55, 0, 0.18], [-1.35 - pumpL * 0.35, 0, 0], [0, RELAX_WRIST, 0],
        [-0.85 + pumpR * 0.55, 0, -0.18], [-1.35 - pumpR * 0.35, 0, 0], [0, -RELAX_WRIST, 0]);
      P.hL = HAND.fist; P.hR = HAND.fist;
    } else {                                         /* raise the roof */
      const up = 0.5 + 0.5 * Math.cos(TAU * b);
      arms(P,
        [-2.35 + up * 0.25, 0.35, 0.28], [-0.55 - up * 0.25, 0, 0], [0, 0, 0],
        [-2.35 + up * 0.25, -0.35, -0.28], [-0.55 - up * 0.25, 0, 0], [0, 0, 0]);
      P.hL = HAND.open; P.hR = HAND.open;
    }
    /* ease the arms in during the first moments so they don't pop */
    if (k < 1) {
      P.aL.sh = P.aL.sh.map((x, i) => lerp(i === 2 ? 0.09 : 0, x, k));
      P.aR.sh = P.aR.sh.map((x, i) => lerp(i === 2 ? -0.09 : 0, x, k));
    }
  },
};

/* ═══════════════ main entry ═══════════════
   ctl fields used (all optional unless noted):
     rig*, state*, pos*(x,z), vel*(y), onGround*, yaw, held, level, sitTarget, liePose, lieRoll,
     moving, running, _emoteTimer, _emoteName, _emotePhase, _useTimer, _useBend,
     _groundInfo(x,z,level) -> {y}, _ul(), _hipsY (written back),
     _overlay(R, emoting) -> applies selfie / weapon / phone layers directly onto R.          */
export function animate(ctl, dt) {
  const R = ctl.rig;
  if (!R || !R.hips) return;
  const a = ctl._anim || (ctl._anim = newState());
  if (a.rig !== R) { a.rig = R; a.init = false; a.joints = collectJoints(R); a.S = new Float32Array(a.joints.length * 3);
    const lj = new Set([R.legL.hip, R.legL.knee, R.legL.ankle || R.legL.ank, R.legR.hip, R.legR.knee, R.legR.ankle || R.legR.ank]);
    a.leg = a.joints.map(j => lj.has(j)); }
  dt = clamp(dt || 0, 0, 0.1);
  if (dt <= 0) dt = 1 / 60;

  /* ── measure real ground speed / acceleration / turn rate ── */
  const px = ctl.pos.x, pz = ctl.pos.z;
  if (a.havePos) {
    const dist = Math.hypot(px - a.px, pz - a.pz);
    const vi = (ctl._intentSpeed !== undefined) ? ctl._intentSpeed : (dist > 2.5 ? 0 : dist / dt);   /* intent wins; else real displacement */
    const ls = a.speed;
    a.speed += (vi - a.speed) * (1 - Math.exp(-dt * 14));
    a.acc += (((a.speed - ls) / dt) - a.acc) * (1 - Math.exp(-dt * 8));
  }
  a.px = px; a.pz = pz; a.havePos = true;
  if (ctl.yaw !== undefined) {
    if (a.haveYaw) {
      let dy = ctl.yaw - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      a.yawRate += (dy / dt - a.yawRate) * (1 - Math.exp(-dt * 10));
    }
    a.yaw = ctl.yaw; a.haveYaw = true;
  }

  const seated = ctl.state !== "standing" && ctl.state !== "crouching";
  const crouching = ctl.state === "crouching";
  a.moveAmt = seated ? 0 : sstep(a.speed / 0.45);
  a.runAmt = sstep((a.speed - 1.8) / 1.5);
  a.idleT += dt; a.breathT += dt;

  /* ── gait phase from speed (feet stay planted) ── */
  if (!seated && ctl.onGround !== false && a.moveAmt > 0.01) {
    a.u = wrap1(a.u + gaitParams(a.speed, a.runAmt, crouching).f * dt);
  }

  /* ── landing detection ── */
  const grounded = ctl.onGround !== false;
  if (!grounded) { a.airborne = true; a.lastVy = ctl.vel ? ctl.vel.y : 0; }
else if (ctl._lastVy !== undefined) { a.lastVy = ctl._lastVy; }
  else if (a.airborne) { a.airborne = false; a.land = clamp(-a.lastVy / 9, 0, 1); }
  a.land *= Math.exp(-dt * 7);

  /* ── emote timers (moved here from the controller) ── */
  let emoting = false;
  if (ctl._emoteTimer > 0 && ctl._emoteName && !seated) {
  /* Play emotes 40% faster so they finish in reasonable time
     and feel punchy in the mansion's big rooms. */
  const emoteSpeed = 1.4;
  ctl._emoteTimer -= dt * emoteSpeed;
  ctl._emotePhase = (ctl._emotePhase || 0) + dt * emoteSpeed;
    if (ctl._emoteTimer <= 0) { ctl._emoteTimer = 0; ctl._emoteName = null; if (ctl._ul) ctl._ul(); }
    else emoting = true;
  }

  /* ── build the TARGET pose ── */
  const P = newPose();
  if (seated) {
    seatedPose(a, ctl, P);
  } else if (emoting) {
    EMOTE_FN[ctl._emoteName](ctl._emotePhase, P, a);
    if (ctl._emoteTimer < 0.45) {                      /* ease back to a neutral stand */
      const Pn = newPose(); locomotion(a, ctl, Pn, false);
      blendPose(P, Pn, 1 - sstep(ctl._emoteTimer / 0.45));
    }
  } else if (!grounded) {
    airPose(a, ctl, P);
  } else {
    locomotion(a, ctl, P, crouching);
    idleLayer(a, P, (1 - a.moveAmt) * (crouching ? 0.5 : 1));

    if (ctl.held) {                                   /* carrying: arms forward */
      set3(P.aL.sh, -1.3, 0, 0); set3(P.aR.sh, -1.3, 0, 0);
      set3(P.aL.el, -1.6, 0, 0); set3(P.aR.el, -1.6, 0, 0);
      P.hL = HAND.open; P.hR = HAND.open;
    }
    /* interaction bend (wash / cook / fridge …) */
    if (ctl._useTimer > 0) {
      if (ctl._useTimer > a.lastUse + 1e-4) a.useTotal = ctl._useTimer;
      a.lastUse = ctl._useTimer;
      ctl._useTimer -= dt;
      const p = 1 - Math.max(0, ctl._useTimer) / Math.max(a.useTotal, 0.1);
      const wv = Math.sin(clamp(p, 0, 1) * PI);
      if (wv > 0.01) {
        P.spine[0] += wv * (ctl._useBend != null ? ctl._useBend : 0.3);
        set3(P.aL.sh, -wv * 1.1, 0, 0.08); set3(P.aR.sh, -wv * 1.1, 0, -0.08);
        set3(P.aL.el, -0.4 - wv * 0.6, 0, 0); set3(P.aR.el, -0.4 - wv * 0.6, 0, 0);
      }
    } else a.lastUse = 0;
  }

  /* weapons / phone keep the wrist un-rolled so held meshes stay oriented */
  const noRelax = ctl.phoneHold || ctl._selfieHold || (ctl.weapons && ctl.weapons.isArmed && ctl.weapons.isArmed());
  if (noRelax && !emoting) { P.aL.wr[1] = 0; P.aR.wr[1] = 0; }

  /* ── write target onto the rig, then let overlays modify it ── */
  /* ── write target onto the rig, then let overlays modify it ── */
writePose(R, P);

// Let guns/knives override the arm poses if we are aiming or attacking
if (ctl.weapons && ctl.weapons.isArmed && ctl.weapons.isArmed() && !emoting) {
  try { ctl.weapons.applyArmPose(R); } catch (e) {}
}

if (ctl._overlay) ctl._overlay(R, emoting);

  /* ── blend: read target back from the rig, ease the displayed pose toward it ── */
  const key = ctl.state + "|" + (emoting ? ctl._emoteName : "") + "|" + (grounded ? "g" : "a") + "|" + (ctl.held ? "h" : "");
  if (key !== a.key) { a.key = key; a.bs = 0.55; }
  a.bs += (1 - a.bs) * Math.min(1, dt * 3.2);
  /* Emotes should hit hard and fast — they were 42 which is fine at 60fps
   but noticeably soft on 30fps devices. 90 makes them feel snappy
   everywhere without looking robotic on 60fps. */
const rate = emoting ? 90 : lerp(11, 26, a.moveAmt) * a.bs;
const k = a.init ? 1 - Math.exp(-dt * rate) : 1;
const kLeg = a.init ? 1 - Math.exp(-dt * (emoting ? 90 : lerp(rate, 110, a.moveAmt))) : 1;
  const J = a.joints, S = a.S;
  for (let i = 0; i < J.length; i++) {
    const r = J[i].rotation, kk = a.leg[i] ? kLeg : k;
    S[i * 3]     += (r.x - S[i * 3]) * kk;
    S[i * 3 + 1] += (r.y - S[i * 3 + 1]) * kk;
    S[i * 3 + 2] += (r.z - S[i * 3 + 2]) * kk;
    r.x = S[i * 3]; r.y = S[i * 3 + 1]; r.z = S[i * 3 + 2];
  }
  const hp = R.hips.position, SH = a.SH;
  if (!a.init) { SH[0] = hp.x; SH[1] = hp.y; SH[2] = hp.z; }
  const kh = a.init ? 1 - Math.exp(-dt * rate * 0.9) : 1;
  SH[0] += (hp.x - SH[0]) * kh; SH[2] += (hp.z - SH[2]) * kh;
  SH[1] += (hp.y - SH[1]) * kLeg;                       /* pelvis height must stay glued to the IK feet */
  hp.x = SH[0]; hp.y = SH[1]; hp.z = SH[2];
  a.init = true;
  ctl._hipsY = SH[1];
}

function blendPose(A, B, t) {
  for (const k in A) {
    const x = A[k], y = B[k];
    if (Array.isArray(x)) { for (let i = 0; i < x.length; i++) x[i] = lerp(x[i], y[i], t); }
    else if (k === "hL" || k === "hR") { if (t > 0.5) A[k] = y; }
    else if (x && typeof x === "object") blendPose(x, y, t);
  }
}

function writePose(R, P) {
  R.hips.rotation.set(P.hips[0], P.hips[1], P.hips[2]);
  R.hips.position.set(P.hipsPos[0], P.hipsPos[1], P.hipsPos[2]);
  R.spine.rotation.set(P.spine[0], P.spine[1], P.spine[2]);
  if (R.neck) R.neck.rotation.set(P.neck[0], P.neck[1], P.neck[2]);
  R.head.rotation.set(P.head[0], P.head[1], P.head[2]);
  const put = (j, v) => j && j.rotation.set(v[0], v[1], v[2]);
  put(R.armL.shoulder, P.aL.sh); put(R.armL.elbow, P.aL.el); put(R.armL.wrist, P.aL.wr);
  put(R.armR.shoulder, P.aR.sh); put(R.armR.elbow, P.aR.el); put(R.armR.wrist, P.aR.wr);
  const an = (l) => l.ank || l.ankle;
  put(R.legL.hip, P.lL.hip); put(R.legL.knee, P.lL.knee); put(an(R.legL), P.lL.ank);
  put(R.legR.hip, P.lR.hip); put(R.legR.knee, P.lR.knee); put(an(R.legR), P.lR.ank);
  setHand(R.armL, +1, P.hL); setHand(R.armR, -1, P.hR);
}
/* Local re-export so character-hub.js can import setHand by name.
   (Already defined above; this comment is just the anchor.) */
