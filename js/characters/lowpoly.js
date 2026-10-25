import * as THREE from "three";
import { Wardrobe, SKIN_TONES, HAIR_COLORS, SHOE_COLORS, SHIRT_COLORS } from "../core/wardrobe.js";

const V2 = (x, y) => new THREE.Vector2(x, y);

function revolve(profile, { radial = 10, capSeg = 4, capBottom = 1, capTop = 1 } = {}) {
  const pts = [];
  const lo = profile[0];
  for (let i = 0; i <= capSeg; i++) {
    const a = -Math.PI / 2 + (i / capSeg) * (Math.PI / 2);
    pts.push(V2(Math.max(0, Math.cos(a)) * lo.r, lo.y + Math.sin(a) * lo.r * capBottom));
  }
  for (let i = 1; i < profile.length; i++) pts.push(V2(profile[i].r, profile[i].y));
  const hi = profile[profile.length - 1];
  for (let i = 1; i <= capSeg; i++) {
    const a = (i / capSeg) * (Math.PI / 2);
    pts.push(V2(Math.max(0, Math.cos(a)) * hi.r, hi.y + Math.sin(a) * hi.r * capTop));
  }
  return new THREE.LatheGeometry(pts, radial);
}

function bone(rTop, rBot, length, radial = 8) {
  return revolve(
    [{ y: -length, r: rBot }, { y: 0, r: rTop }],
    { radial, capSeg: 3, capBottom: 1, capTop: 1 }
  );
}

export const HIP_HEIGHT = 0.935;

/* Garment-shape multipliers */
const TOP_SCALE = {
  tshirt: 1.00, tank: 0.94, longsleeve: 1.02, hoodie: 1.14, jacket: 1.08,
  singlet: 0.88, suit: 1.10, polo: 1.01, croptop: 0.94,
};
const BOTTOM_SCALE = {
  jeans: 1.00, tracksuit: 1.05, shorts: 1.02, baggy: 1.22,
};
const SHOE_SCALE = {
  sneakers: 1.00, boots: 1.10, formal: 0.92, sandals: 0.82, slippers: 0.80,
};

function topScale(cfg) { return TOP_SCALE[cfg && cfg.topStyle] || 1.00; }
function bottomScale(cfg) { return BOTTOM_SCALE[cfg && cfg.bottomStyle] || 1.00; }
function shoeScale(cfg) { return SHOE_SCALE[cfg && cfg.shoeStyle] || 1.00; }

export function makeBlob() {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  g.addColorStop(0.00, "rgba(0,0,0,0.55)");
  g.addColorStop(0.55, "rgba(0,0,0,0.28)");
  g.addColorStop(1.00, "rgba(0,0,0,0.00)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9 })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.005;
  blob.scale.set(1.15, 1.15, 1);
  return blob;
}

/* ── Hair ───────────────────────────────────────────────
   IMPORTANT: the hair cap sits on a skull of radius 0.105,
   centred in the head group at y = 0.055. Eyes are at y ≈ 0.068,
   eyebrows at y ≈ 0.098. Anything whose lowest vertex dips below
   0.098 will visually sit on / over the eyes.

   Safe rule used here:
     cap.position.y >= 0.065
     phiLength       <= PI * 0.42   (so cap bottom stays at ~0.098)

   Extra decorations (curly clumps, ponytail tie) are lifted to
   y >= 0.10 to avoid the same eye-line crossing.             */
function buildHair(style, mats, head) {
  if (!style || style === "bald") return;
  const g = new THREE.Group();
  const M = mats.hair;
  const PHI_MAX = Math.PI * 0.42;    /* safe cap top angle */

  if (style === "short") {
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.112, 12, 9, 0, Math.PI * 2, 0, PHI_MAX), M);
    cap.position.y = 0.070; cap.scale.set(1.02, 1.10, 1.06); cap.rotation.x = -0.14;
    cap.castShadow = true;
    g.add(cap);
  } else if (style === "buzz") {
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.109, 10, 7, 0, Math.PI * 2, 0, PHI_MAX * 0.92), M);
    cap.position.y = 0.068; cap.scale.set(1.005, 1.03, 1.02); cap.rotation.x = -0.14;
    cap.castShadow = true;
    g.add(cap);
  } else if (style === "curly") {
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.120, 10, 8, 0, Math.PI * 2, 0, PHI_MAX), M);
    cap.position.y = 0.072; cap.scale.set(1.04, 1.10, 1.06); cap.rotation.x = -0.12;
    cap.castShadow = true;
    g.add(cap);
    /* Clumps must stay above y ≈ 0.10 so they don't cover the eyes. */
    for (let i = 0; i < 12; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.026, 5, 4), M);
      const a = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.32;
      b.position.set(
        Math.cos(a) * Math.sin(phi) * 0.105,
        0.115 + Math.cos(phi) * 0.055,
        Math.sin(a) * Math.sin(phi) * 0.105
      );
      b.castShadow = true;
      g.add(b);
    }
  } else if (style === "long") {
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.115, 12, 9, 0, Math.PI * 2, 0, PHI_MAX), M);
    cap.position.y = 0.070; cap.scale.set(1.02, 1.10, 1.06); cap.rotation.x = -0.14;
    cap.castShadow = true;
    g.add(cap);
    /* Back-of-head hair is fine to reach lower — it's behind the face. */
    const back = new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 8), M);
    back.position.set(0, -0.03, -0.055);
    back.scale.set(1.0, 1.55, 0.85);
    back.castShadow = true;
    g.add(back);
  } else if (style === "ponytail") {
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.112, 12, 9, 0, Math.PI * 2, 0, PHI_MAX), M);
    cap.position.y = 0.070; cap.scale.set(1.02, 1.10, 1.06); cap.rotation.x = -0.14;
    cap.castShadow = true;
    g.add(cap);
    /* Tie + tail sit behind the head. */
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.008, 4, 10), M);
    tie.position.set(0, 0.055, -0.115);
    tie.rotation.x = Math.PI / 2;
    tie.castShadow = true;
    g.add(tie);
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.058, 8, 7), M);
    tail.position.set(0, -0.02, -0.145);
    tail.scale.set(0.85, 1.55, 0.85);
    tail.castShadow = true;
    g.add(tail);
  }
  head.add(g);
}

/* ── Glasses ──────────────────────────────────────────── */
function buildGlasses(style, mats, head) {
  if (!style) return;
  const g = new THREE.Group();
  const M = mats.glasses;
  const z = 0.099;

  if (style === "round") {
    for (const s of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.004, 5, 12), M);
      ring.position.set(0.041 * s, 0.068, z);
      ring.castShadow = true;
      g.add(ring);
    }
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.005, 0.005), M);
    br.position.set(0, 0.068, z); g.add(br);
  } else if (style === "square") {
    for (const s of [-1, 1]) {
      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.006), M);
      lens.position.set(0.041 * s, 0.068, z); lens.castShadow = true; g.add(lens);
    }
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.005, 0.005), M);
    br.position.set(0, 0.068, z); g.add(br);
  } else if (style === "shades") {
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.038, 0.012), M);
    lens.position.set(0, 0.068, z); lens.castShadow = true; g.add(lens);
  }
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.075), M);
    arm.position.set(0.065 * s, 0.068, z - 0.04); g.add(arm);
  }
  head.add(g);
}

/* ── Hat ──────────────────────────────────────────────── */
function buildHat(hat, mats, head) {
  if (!hat) return;
  const g = new THREE.Group();
  const M = mats.hat;
  M.color.set(new THREE.Color(SHIRT_COLORS[hat.color || 0] || 0x444444));

  if (hat.style === "cap") {
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.118, 12, 8, 0, Math.PI*2, 0, Math.PI*0.46), M);
  crown.position.y = 0.075; crown.castShadow = true; g.add(crown);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.008, 16, 1, false, 0, Math.PI), M);
  brim.position.set(0, 0.075, 0.06);
  brim.rotation.x = -0.35;
  brim.castShadow = true;
  g.add(brim);
} else if (hat.style === "beanie") {
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.121, 12, 8, 0, Math.PI*2, 0, Math.PI*0.50), M);
  crown.position.y = 0.070; crown.scale.set(1.04, 1.08, 1.04); crown.castShadow = true;
  g.add(crown);
  const fold = new THREE.Mesh(new THREE.TorusGeometry(0.114, 0.013, 6, 16), M);
  fold.position.y = 0.075;
  fold.rotation.x = Math.PI / 2;
  fold.castShadow = true;
  g.add(fold);
} else if (hat.style === "barret") {
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.124, 14, 8, 0, Math.PI*2, 0, Math.PI*0.36), M);
  cap.position.set(0.02, 0.075, 0.01);
  cap.scale.set(1.06, 0.55, 1.06);
  cap.rotation.z = -0.28;
  cap.castShadow = true; g.add(cap);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.03, 6), M);
  tip.position.set(0.06, 0.11, 0); g.add(tip);
} else if (hat.style === "facecap") {
  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(0.118, 12, 8, 0, Math.PI*2, 0, Math.PI*0.45), M);
  crown.position.y = 0.075; crown.castShadow = true; g.add(crown);
  const brim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.115, 0.115, 0.010, 20, 1, false, 0, Math.PI*0.9), M);
  brim.position.set(0, 0.075, 0.075);
  brim.rotation.set(-0.25, 0, 0);
  brim.castShadow = true; g.add(brim);
}
  head.add(g);
}

/* ── Main builder ─────────────────────────────────────── */
export function buildCharacter(config) {
  config = config || Wardrobe.config;
  const root = new THREE.Group();
  const rig = {};
  const mats = Wardrobe.makeMaterials(config);
  rig.mats = mats;
  buildInto(root, rig, config, mats);
  return { root, rig };
}

export function applyConfig(root, rig, config) {
  while (root.children.length) {
    const c = root.children[0];
    root.remove(c);
    disposeTree(c);
  }
  Wardrobe.updateMaterials(rig.mats, config);
  buildInto(root, rig, config, rig.mats);
}

function disposeTree(node) {
  node.traverse(o => {
    if (o.geometry) o.geometry.dispose();
  });
}

function buildInto(root, rig, config, mats) {
  const M = mats;

  const tScale = topScale(config);
  const bScale = bottomScale(config);
  const sScale = shoeScale(config);
  const isShorts = config.bottomStyle === "shorts";
  const isBaggy  = config.bottomStyle === "baggy";

  /* ── hips ── */
  const hips = new THREE.Group();
  hips.position.y = HIP_HEIGHT;
  root.add(hips);
  rig.hips = hips;

  const pelvis = new THREE.Mesh(
    revolve([
      { y: -0.100, r: 0.135 * bScale },
      { y: -0.040, r: 0.155 * bScale },
      { y:  0.020, r: 0.152 * bScale },
      { y:  0.070, r: 0.142 * bScale },
    ], { radial: 12, capBottom: 0.40, capTop: 0.50 }),
    M.bottom
  );
  pelvis.scale.z = 0.74;
  pelvis.castShadow = true;
  pelvis.receiveShadow = true;
  hips.add(pelvis);

  /* ── spine ── */
  const spine = new THREE.Group();
  spine.position.y = 0.06;
  hips.add(spine);
  rig.spine = spine;

  const torso = new THREE.Mesh(
    revolve([
      { y: 0.000, r: 0.145 * tScale },
      { y: 0.080, r: 0.156 * tScale },
      { y: 0.180, r: 0.176 * tScale },
      { y: 0.280, r: 0.196 * tScale },
      { y: 0.355, r: 0.190 * tScale },
      { y: 0.400, r: 0.158 * tScale },
    ], { radial: 12, capBottom: 0.45, capTop: 0.35 }),
    M.top
  );
  torso.scale.z = 0.70;
  torso.castShadow = true;
  torso.receiveShadow = true;
  spine.add(torso);

  if (config.gender === "feminine") {
  torso.scale.set(0.93 * tScale / Math.max(tScale, 0.01), 1.00, 0.68);
  pelvis.scale.set(1.06 * bScale / Math.max(bScale, 0.01), 1.00, 0.76);
} else if (config.gender === "masculine") {
  torso.scale.set(1.06 * tScale / Math.max(tScale, 0.01), 1.00, 0.72);
  pelvis.scale.set(0.98 * bScale / Math.max(bScale, 0.01), 1.00, 0.74);
}

/* ── additional Nigerian-fashion torso details ── */
if (config.topStyle === "singlet") {
  /* A proper deep-cut vest: wide, low scoop neckline (skin ring at
     the collar instead of a floating sphere glued on the sternum)
     plus narrow shoulder straps so the cut actually reads against
     the shoulders instead of looking like a plain filled tank. */
  const scoop = new THREE.Mesh(
    new THREE.TorusGeometry(0.095, 0.050, 8, 14, Math.PI * 1.15),
    M.skin
  );
  scoop.position.set(0, 0.375, 0.02);
  scoop.rotation.set(Math.PI / 2, 0, Math.PI * 0.925);
  scoop.scale.set(1.0, 1.0, 0.55);
  scoop.castShadow = true;
  spine.add(scoop);
  /* Narrow straps over the shoulders, sitting on top of the scoop
     cut so the vest reads as held up rather than just low-cut. */
  for (const s of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.09, 0.14), M.top);
    strap.position.set(s * 0.085, 0.40, 0.01);
    strap.rotation.z = s * 0.12;
    strap.castShadow = true;
    spine.add(strap);
  }
  /* Underarm gap hint: small skin wedges just below the strap line
     on each side, so the silhouette breaks instead of reading as a
     full sealed shirt down to the sleeve line. */
  for (const s of [-1, 1]) {
    const gap = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), M.skin);
    gap.scale.set(0.8, 1.1, 0.6);
    gap.position.set(s * 0.165, 0.335, 0.01);
    spine.add(gap);
  }
} else if (config.topStyle === "polo") {
  /* Collar + V split */
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, 0.03, 12, 1, true), M.top);
  collar.position.y = 0.41;
  collar.rotation.x = -0.08;
  spine.add(collar);
  const v = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.10, 0.02), M.top);
  v.position.set(0, 0.34, 0.135);
  v.rotation.z = Math.PI;
  spine.add(v);
} else if (config.topStyle === "suit") {
  /* White inner shirt */
  const innerMat = new THREE.MeshLambertMaterial({ color: 0xf4f4f4 });
  const inner = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.36, 0.02), innerMat);
  inner.position.set(0, 0.24, 0.135);
  spine.add(inner);
  /* Lapels */
  for (const s of [-1, 1]) {
    const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.30, 0.03), M.top);
    lapel.position.set(s * 0.075, 0.26, 0.15);
    lapel.rotation.z = s * 0.28;
    spine.add(lapel);
  }
  /* Tie -- a dark, slightly desaturated complement of the jacket
     color so it reads as deliberate rather than a random red slash,
     with a visible highlight stripe down the blade for contrast. */
  if (config.tie && config.tie !== "none") {
    const jacketCol = new THREE.Color().copy(M.top.color);
    const tieHsl = { h: 0, s: 0, l: 0 };
    jacketCol.getHSL(tieHsl);
    const tieCol = new THREE.Color().setHSL(
      (tieHsl.h + 0.5) % 1,
      Math.max(0.35, tieHsl.s),
      Math.min(0.28, Math.max(0.16, tieHsl.l * 0.6))
    );
    const tieMat = new THREE.MeshLambertMaterial({ color: tieCol });
    const stripeMat = new THREE.MeshLambertMaterial({ color: tieCol.clone().offsetHSL(0, 0, 0.14) });

    /* Collar gap: a thin wedge of the white shirt shows on either
       side of the knot instead of the jacket lapels meeting flush,
       which is what made the old knot look like it was floating
       disconnected above the tie. */
    const collarMat = new THREE.MeshLambertMaterial({ color: 0xf4f4f4 });
    for (const s of [-1, 1]) {
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.07, 0.025), collarMat);
      flap.position.set(s * 0.05, 0.395, 0.148);
      flap.rotation.z = s * 0.5;
      spine.add(flap);
    }

    if (config.tie === "bow") {
      const centerKnot = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, 0.025), tieMat);
      centerKnot.position.set(0, 0.395, 0.155);
      spine.add(centerKnot);
      for (const s of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.045, 0.02), tieMat);
        wing.position.set(s * 0.05, 0.395, 0.153);
        wing.rotation.z = s * 0.55;
        spine.add(wing);
        const pinch = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.045, 0.026), tieMat);
        pinch.position.set(s * 0.016, 0.395, 0.158);
        spine.add(pinch);
      }
    } else {
      const skinny = config.tie === "skinny";
      const knotW = skinny ? 0.032 : 0.05;
      const bladeTopW = skinny ? 0.030 : 0.046;
      const bladeBotW = skinny ? 0.034 : 0.058;
      const bladeLen = skinny ? 0.27 : 0.30;
      const bladeTopY = 0.355;
      const bladeBotY = bladeTopY - bladeLen;

      /* Knot: a short trapezoid-ish block right under the collar. */
      const knot = new THREE.Mesh(new THREE.BoxGeometry(knotW, 0.045, 0.028), tieMat);
      knot.position.set(0, 0.378, 0.158);
      spine.add(knot);

      /* Blade: tapered via two stacked boxes (wide shoulders,
         narrower tip) so it isn't a single flat rectangle. */
      const bladeUpper = new THREE.Mesh(
        new THREE.BoxGeometry(bladeTopW, bladeLen * 0.5, 0.018), tieMat);
      bladeUpper.position.set(0, bladeTopY - bladeLen * 0.25, 0.153);
      spine.add(bladeUpper);
      const bladeLower = new THREE.Mesh(
        new THREE.BoxGeometry(bladeBotW, bladeLen * 0.5, 0.018), tieMat);
      bladeLower.position.set(0, bladeBotY + bladeLen * 0.25, 0.150);
      spine.add(bladeLower);

      /* Center highlight stripe for a less flat, more fabric-like look. */
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(bladeTopW * 0.28, bladeLen * 0.92, 0.004), stripeMat);
      stripe.position.set(0, (bladeTopY + bladeBotY) / 2, 0.1615);
      spine.add(stripe);

      /* Dimple just below the knot -- a small notch that breaks up
         the join between knot and blade. */
      const dimple = new THREE.Mesh(new THREE.BoxGeometry(knotW * 0.5, 0.012, 0.006), stripeMat);
      dimple.position.set(0, 0.350, 0.160);
      spine.add(dimple);
    }
  }
} else if (config.topStyle === "hoodie") {
  /* Hood draped on the upper back/neck, a drawstring collar, and a
     kangaroo pouch pocket on the front -- previously a hoodie had
     none of this and just rendered as a plain long-sleeve shirt. */
  const hoodMat = M.top;

  /* Collar/neckline roll: a slightly raised ring at the base of the
     neck so the hood has something to visually attach to. */
  const collarRoll = new THREE.Mesh(
    new THREE.TorusGeometry(0.082, 0.020, 8, 14), hoodMat);
  collarRoll.position.set(0, 0.405, 0);
  collarRoll.rotation.x = Math.PI / 2;
  collarRoll.castShadow = true;
  spine.add(collarRoll);

  /* The hood itself, slumped down the back between the shoulder
     blades -- an angled, tapered sack shape rather than a flat
     panel, so it reads as loose fabric and not a backpack. */
  const hood = new THREE.Mesh(
    revolve([
      { y:  0.060, r: 0.075 },
      { y: -0.010, r: 0.088 },
      { y: -0.090, r: 0.080 },
      { y: -0.150, r: 0.050 },
    ], { radial: 10, capBottom: 0.3, capTop: 0.3 }),
    hoodMat
  );
  hood.position.set(0, 0.38, -0.115);
  hood.rotation.x = -0.32;
  hood.scale.set(1.0, 1.0, 0.75);
  hood.castShadow = true;
  spine.add(hood);

  /* Two drawstrings hanging from the collar. */
  for (const s of [-1, 1]) {
    const string = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, 0.09, 5), M.skin.clone());
    string.material.color.set(0xe8e4da);
    string.position.set(s * 0.022, 0.345, 0.148);
    spine.add(string);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.014, 6), string.material);
    tip.position.set(s * 0.022, 0.298, 0.148);
    spine.add(tip);
  }

  /* Kangaroo pouch pocket, low on the front. */
  const pouch = new THREE.Mesh(
    new THREE.BoxGeometry(0.17, 0.10, 0.03), hoodMat);
  pouch.position.set(0, 0.145, 0.155);
  pouch.castShadow = true;
  spine.add(pouch);
  /* Pocket seam line (slightly darker) so the opening reads clearly. */
  const seamMat = new THREE.MeshLambertMaterial({ color: new THREE.Color().copy(M.top.color).offsetHSL(0, 0, -0.12) });
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.034), seamMat);
  seam.position.set(0, 0.188, 0.156);
  spine.add(seam);

  /* Ribbed hem band at the waist, a hoodie staple missing from the
     plain torso silhouette. */
  const hem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.150 * tScale, 0.150 * tScale, 0.035, 12),
    hoodMat
  );
  hem.position.y = 0.015;
  hem.scale.z = 0.72;
  hem.castShadow = true;
  spine.add(hem);
} else if (config.topStyle === "croptop") {
  /* Bare midriff strip below the torso */
  const midriff = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14 * 0.98, 0.15, 0.10, 12), M.skin);
  midriff.position.y = 0.05;
  spine.add(midriff);
}

/* ── neck + head ── */
  const neck = new THREE.Group();
  neck.position.y = 0.40;
  spine.add(neck);
  rig.neck = neck;
  const neckMesh = new THREE.Mesh(bone(0.052, 0.060, 0.10, 8), M.skin);
  neckMesh.castShadow = true;
  neck.add(neckMesh);

  const head = new THREE.Group();
  head.position.y = 0.11;
  neck.add(head);
  rig.head = head;

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 10), M.skin);
  skull.position.y = 0.055;
  skull.scale.set(1.00, 1.10, 1.04);
  skull.castShadow = true;
  skull.receiveShadow = true;
  head.add(skull);

  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.082, 10, 7), M.skin);
  jaw.position.set(0, 0.012, 0.014);
  jaw.scale.set(1.00, 0.72, 1.02);
  jaw.castShadow = true;
  jaw.receiveShadow = true;
  head.add(jaw);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.044, 6), M.skin);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.045, 0.104);
  nose.castShadow = true;
  head.add(nose);

  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.021, 8, 6), M.eyeW);
    w.position.set(0.041 * s, 0.068, 0.086);
    w.scale.set(1, 1, 0.62);
    head.add(w);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.0115, 6, 5), M.eyeD);
    p.position.set(0.041 * s, 0.068, 0.099);
    p.scale.set(1, 1, 0.7);
    head.add(p);
    const brow = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), M.hair);
    brow.position.set(0.042 * s, 0.098, 0.089);
    brow.scale.set(1.25, 0.32, 0.55);
    head.add(brow);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.034, 7, 5), M.skin);
    ear.position.set(0.103 * s, 0.055, -0.004);
    ear.scale.set(0.32, 1.0, 0.78);
    ear.castShadow = true;
    head.add(ear);
  }

  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.024, 7, 5), M.mouth);
  mouth.position.set(0, 0.018, 0.097);
  mouth.scale.set(1.0, 0.28, 0.28);
  head.add(mouth);

  buildHair(config.hairStyle, M, head);
  buildGlasses(config.glasses, M, head);
  buildHat(config.hat, M, head);

  /* ── arms ── */
  function makeArm(side) {
    const g = {};
    const shoulder = new THREE.Group();
    shoulder.position.set(0.185 * side, 0.350, 0);
    spine.add(shoulder);
    g.shoulder = shoulder;

    const delt = new THREE.Mesh(new THREE.SphereGeometry(0.070 * tScale, 8, 6), M.top);
    delt.scale.set(0.95, 1.02, 0.95);
    delt.castShadow = true;
    shoulder.add(delt);

    const upperR = 0.058 * tScale;
    const lowerR = 0.047 * tScale;
    const upperArmMesh = new THREE.Mesh(bone(upperR, lowerR, 0.270, 8), M.skin);
    upperArmMesh.castShadow = true;
    shoulder.add(upperArmMesh);

    const topStyle = config.topStyle;
const isTank    = topStyle === "tank" || topStyle === "singlet" || topStyle === "croptop";
const isLong    = topStyle === "longsleeve" || topStyle === "hoodie" ||
                  topStyle === "jacket" || topStyle === "suit";
const isSleeved = !isTank;

if (isSleeved) {
  const sleeveLen = isLong ? 0.270 : (topStyle === "polo" ? 0.170 : 0.130);
      const sleeve = new THREE.Mesh(
        revolve([
          { y: -sleeveLen,        r: (isLong ? 0.048 : 0.070) * tScale },
          { y: -sleeveLen * 0.5,  r: (isLong ? 0.055 : 0.077) * tScale },
          { y:  0.006,            r: 0.083 * tScale },
        ], { radial: 10, capBottom: 0.22, capTop: 0.55 }),
        M.top
      );
      sleeve.castShadow = true;
      shoulder.add(sleeve);
    }

    const elbow = new THREE.Group();
    elbow.position.y = -0.270;
    shoulder.add(elbow);
    g.elbow = elbow;

    const foreRTop = isLong ? 0.055 * tScale : 0.048 * tScale;
    const foreRBot = isLong ? 0.048 * tScale : 0.038 * tScale;
    const forearmMesh = new THREE.Mesh(bone(foreRTop, foreRBot, 0.250, 8), isLong ? M.top : M.skin);
    forearmMesh.castShadow = true;
    elbow.add(forearmMesh);

    const wrist = new THREE.Group();
    wrist.position.y = -0.250;
    elbow.add(wrist);
    g.wrist = wrist;

    /* ────────────── Palm ────────────── */
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.050, 8, 6), M.skin);
    palm.scale.set(0.85, 1.00, 0.55);
    palm.position.y = -0.045;
    palm.castShadow = true;
    wrist.add(palm);

    /* ────────────── Thumb ────────────── */
    const thumbGroup = new THREE.Group();
    thumbGroup.position.set(-0.032 * side, -0.035, 0.008);
    const thumbMesh = new THREE.Mesh(new THREE.SphereGeometry(0.020, 6, 5), M.skin);
    thumbMesh.scale.set(0.80, 1.30, 0.90);
    thumbMesh.position.y = -0.018;
    thumbMesh.castShadow = true;
    thumbGroup.add(thumbMesh);
    wrist.add(thumbGroup);
    g.thumb = thumbGroup;

    /* ────────────── Four curlable fingers ────────────── */
    const fingers = [];
    for (let f = 0; f < 4; f++) {
      const fx = (f - 1.5) * 0.023;
      const fingerGroup = new THREE.Group();
      fingerGroup.position.set(fx, -0.068, 0.020);

      const proximal = new THREE.Mesh(
        new THREE.BoxGeometry(0.019, 0.032, 0.019),
        M.skin
      );
      proximal.position.y = -0.016;
      proximal.castShadow = true;
      fingerGroup.add(proximal);

      const midJoint = new THREE.Group();
      midJoint.position.y = -0.032;
      fingerGroup.add(midJoint);

      const distal = new THREE.Mesh(
        new THREE.BoxGeometry(0.017, 0.026, 0.017),
        M.skin
      );
      distal.position.y = -0.013;
      distal.castShadow = true;
      midJoint.add(distal);

        wrist.add(fingerGroup);
  fingers.push({ group: fingerGroup, midJoint });
}
    g.fingers = fingers;

    /* ────────────── Grip anchor ────────────── */
    const grip = new THREE.Group();
    grip.position.set(0, -0.075, 0.005);
    wrist.add(grip);
    g.grip = grip;

    return g;
  }

  /* ── legs ──
     Foot rest offset: from hip pivot at y=-0.010 in hips (y=0.935), the
     ankle is at -0.010 - 0.420 - 0.400 = -0.830 relative to hips, so
     -0.830 + 0.935 = 0.105 above ground. The shoe bottom sits at
     ~0.105 - 0.055 - 0.050 = 0.000. Perfectly flush at rest.          */
  function makeLeg(side) {
    const g = {};
    const hip = new THREE.Group();
    hip.position.set(0.095 * side, -0.010, 0);
    hips.add(hip);
    g.hip = hip;

    if (isShorts) {
      const shortMesh = new THREE.Mesh(bone(0.092 * bScale, 0.078 * bScale, 0.230, 10), M.bottom);
      shortMesh.castShadow = true;
      hip.add(shortMesh);

      const knee = new THREE.Group();
      knee.position.y = -0.420;
      hip.add(knee);
      g.knee = knee;

      const shinMesh = new THREE.Mesh(bone(0.072, 0.048, 0.400, 8), M.skin);
      shinMesh.castShadow = true;
      knee.add(shinMesh);

      const ankle = new THREE.Group();
      ankle.position.y = -0.400;
      knee.add(ankle);
      g.ankle = ankle;
    } else {
  /* Jeans / tracksuit / baggy trousers */
  const thighTopR = (isBaggy ? 0.115 : 0.092) * bScale;
  const thighBotR = (isBaggy ? 0.098 : 0.072) * bScale;
  const calfTopR  = (isBaggy ? 0.098 : 0.070) * bScale;
  const calfBotR  = (isBaggy ? 0.070 : 0.048) * bScale;

  const thighMesh = new THREE.Mesh(
    bone(thighTopR, thighBotR, 0.420, 10), M.bottom);
  thighMesh.castShadow = true;
  hip.add(thighMesh);

  const knee = new THREE.Group();
  knee.position.y = -0.420;
  hip.add(knee);
  g.knee = knee;

  const calfMesh = new THREE.Mesh(
    bone(calfTopR, calfBotR, 0.400, isBaggy ? 10 : 8), M.bottom);
  calfMesh.castShadow = true;
  knee.add(calfMesh);

  const ankle = new THREE.Group();
  ankle.position.y = -0.400;
  knee.add(ankle);
  g.ankle = ankle;
}

    const shoeStyle = config.shoeStyle;
    const shoeY = -0.055;
    const shoeZ = 0.035;

    if (shoeStyle === "boots") {
      const boot = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), M.shoes);
      boot.scale.set(0.062 * sScale, 0.100 * sScale, 0.135 * sScale);
      boot.position.set(0, -0.020, shoeZ);
      boot.castShadow = true;
      g.ankle.add(boot);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.075 * sScale, 0.085 * sScale, 0.16, 10), M.shoes);
      cuff.position.set(0, 0.070, 0);
      cuff.castShadow = true;
      g.ankle.add(cuff);
    } else if (shoeStyle === "sandals") {
  const sole = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), M.shoes);
  sole.scale.set(0.062 * sScale, 0.018 * sScale, 0.125 * sScale);
  sole.position.set(0, -0.062, shoeZ);
  sole.castShadow = true;
  g.ankle.add(sole);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.04), M.shoes);
  strap.position.set(0, -0.048, shoeZ + 0.02);
  strap.castShadow = true;
  g.ankle.add(strap);
} else if (shoeStyle === "slippers") {
  /* Flat slipper: wide thin sole + single strap */
  const sole = new THREE.Mesh(
    new THREE.BoxGeometry(0.14 * sScale, 0.020 * sScale, 0.30 * sScale),
    M.shoes);
  sole.position.set(0, -0.070, shoeZ);
  sole.castShadow = true;
  g.ankle.add(sole);
  const strap = new THREE.Mesh(
    new THREE.BoxGeometry(0.14 * sScale, 0.024 * sScale, 0.03 * sScale),
    M.shoes);
  strap.position.set(0, -0.055, shoeZ + 0.04);
  strap.castShadow = true;
  g.ankle.add(strap);
} else if (shoeStyle === "formal") {
      const shoe = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), M.shoes);
      shoe.scale.set(0.056 * sScale, 0.042 * sScale, 0.140 * sScale);
      shoe.position.set(0, -0.062, shoeZ);
      shoe.castShadow = true;
      g.ankle.add(shoe);
    } else {
      const shoe = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), M.shoes);
      shoe.scale.set(0.062 * sScale, 0.050 * sScale, 0.125 * sScale);
      shoe.position.set(0, -0.055, shoeZ);
      shoe.castShadow = true;
      g.ankle.add(shoe);
      const heel = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), M.shoes);
      heel.scale.set(0.058 * sScale, 0.055 * sScale, 0.062 * sScale);
      heel.position.set(0, -0.050, -0.026);
      heel.castShadow = true;
      g.ankle.add(heel);
    }

    return g;
  }

  rig.armL = makeArm(+1);
  rig.armR = makeArm(-1);
  rig.legL = makeLeg(+1);
  rig.legR = makeLeg(-1);
}

/* ── Grip controller ────────────────────────────────────── */
export function setGrip(rig, sign, amount) {
  const arm = sign > 0 ? rig.armL : rig.armR;
  if (!arm || !arm.fingers) return;
  const t = Math.max(0, Math.min(1, amount));
  for (const f of arm.fingers) {
    f.group.rotation.x  = t * Math.PI * 0.55;
    f.midJoint.rotation.x = t * Math.PI * 0.60;
  }
  if (arm.thumb) {
    arm.thumb.rotation.x = -t * 0.40;
    arm.thumb.rotation.z = -sign * t * 0.70;
  }
}

/* ── Gait solvers ────────────────────────────────────── */
export function groundLeg(p, stride, kneeAmp, move) {
  const thigh  = -Math.cos(p) * stride;
  const swing  = Math.max(0, -Math.sin(p)) * move;
  const stance = Math.max(0,  Math.sin(p)) * move;
  const knee   = 0.12 * stance + kneeAmp * Math.pow(swing, 1.35);
  const ankle  = 0.30 * Math.max(0, Math.sin(p - 0.5)) * move - 0.06 - 0.22 * swing;
  return { thigh, knee, ankle };
}
export function airLeg(side, vy) {
  const j = (Math.max(-1, Math.min(1, vy / 4.0)) + 1) * 0.5;
  return {
    thigh: -0.30 + (-0.88 - -0.30) * j + (side > 0 ? -0.18 : 0.24),
    knee:   0.35 + ( 1.30 -  0.35) * j + (side > 0 ?  0.28 : -0.16),
    ankle: -0.16 + ( 0.46 - -0.16) * j,
  };
}
export function groundArm(p, amp, runAmt, move) {
  const swing  = Math.cos(p) * amp;
  const e0 = 0.30 + (1.45 - 0.30) * runAmt;
  const elbow  = -(e0 + 0.28 * Math.max(0, Math.cos(p))) * move;
  const spread = 0.10 + (0.06 - 0.10) * runAmt;
  return { swing, elbow, spread };
}
export function airArm(side, vy) {
  const j = (Math.max(-1, Math.min(1, vy / 4.0)) + 1) * 0.5;
  return {
    swing:  -0.50 + (-2.10 - -0.50) * j,
    elbow:  -0.90 + (-0.35 - -0.90) * j,
    spread:  0.55 + ( 0.25 -  0.55) * j,
  };
}
export function attachPhone(rig) {
  if (!rig || !rig.armR || rig.armR._phoneMesh) return;
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.055, 0.10, 0.008),
    new THREE.MeshStandardMaterial({ color: 0x111417, roughness: 0.4 })
  );
  body.castShadow = true;
  g.add(body);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.048, 0.088),
    new THREE.MeshBasicMaterial({ color: 0x7fd0ff })
  );
  screen.position.z = 0.005;
  g.add(screen);
  g.position.set(0, -0.10, 0.06);
  g.rotation.set(-0.5, 0, 0);
  rig.armR.wrist = rig.armR.wrist || rig.armR.elbow;
  rig.armR.wrist.add(g);
  rig.armR._phoneMesh = g;
  rig.armR._phoneMesh.visible = false;
}

export function applyPhonePose(rig, active) {
  if (!rig || !rig.armR || !rig.armR._phoneMesh) return;
  rig.armR._phoneMesh.visible = !!active;
  if (active) {
    rig.armR.shoulder.rotation.x = -1.15;
    rig.armR.shoulder.rotation.z = -0.55;
    rig.armR.shoulder.rotation.y = 0.35;
    rig.armR.elbow.rotation.x = -0.95;
  }
}
