// Draw-call reduction: merge the static child meshes of a group that share a material into one
// mesh per material. Animated or separately toggled parts are passed in `keep` and left alone.
// Merging only changes how the geometry is batched; the look is identical.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// A geometry transformed by a mirroring matrix (negative determinant) has its triangles wound the other
// way; three.js flips the front face for mirrored objects at draw time, but once baked into a merged
// geometry the winding itself has to be reversed.
function bake(geo, matrix) {
  const g = geo.clone();
  g.applyMatrix4(matrix);
  if (matrix.determinant() < 0) {
    if (g.index) {
      const a = g.index.array;
      for (let i = 0; i + 2 < a.length; i += 3) {
        const t = a[i + 1];
        a[i + 1] = a[i + 2];
        a[i + 2] = t;
      }
      g.index.needsUpdate = true;
    } else {
      for (const k of Object.keys(g.attributes)) {
        const at = g.attributes[k];
        const s = at.itemSize;
        const arr = at.array;
        for (let v = 0; v + 2 < at.count; v += 3) {
          for (let c = 0; c < s; c++) {
            const i1 = (v + 1) * s + c, i2 = (v + 2) * s + c;
            const t = arr[i1];
            arr[i1] = arr[i2];
            arr[i2] = t;
          }
        }
        at.needsUpdate = true;
      }
    }
  }
  return g;
}

function mergeInto(group, mat, meshes, matrices) {
  let geos = meshes.map((m, k) => bake(m.geometry, matrices[k]));
  // indexed and non-indexed geometries (extrusions) are merged as non-indexed; only the
  // attributes every geometry has are kept
  if (geos.some((g) => !g.index) && geos.some((g) => g.index)) geos = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const common = Object.keys(geos[0].attributes).filter((k) => geos.every((g) => g.attributes[k]));
  for (const g of geos) for (const k of Object.keys(g.attributes)) if (!common.includes(k)) g.deleteAttribute(k);
  for (const g of geos) for (const k of Object.keys(g.morphAttributes)) delete g.morphAttributes[k];
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) return null; // attribute sets differ: keep the meshes as they are
  const mesh = new THREE.Mesh(merged, mat);
  mesh.name = meshes.map((m) => m.name).filter(Boolean).join('+') || 'merged';
  mesh.castShadow = meshes.some((m) => m.castShadow);
  mesh.receiveShadow = meshes.some((m) => m.receiveShadow);
  for (const m of meshes) {
    m.parent.remove(m);
    m.geometry.dispose();
  }
  group.add(mesh);
  return mesh;
}

// Merge every static mesh below `root` (any depth) that shares a material into one mesh per material
// in root's frame. Only for parts that are never moved or toggled on their own (a pair of gloves,
// a pair of boots); `keep` lists meshes or groups to leave alone. Emptied sub-groups are removed.
export function mergeDeep(root, keep = []) {
  const byMat = new Map();
  const walk = (node, rel) => {
    for (const o of node.children) {
      if (keep.includes(o) || o.userData.noMerge) continue;
      o.updateMatrix();
      const m = new THREE.Matrix4().multiplyMatrices(rel, o.matrix);
      if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !Array.isArray(o.material) && !o.children.length) {
        if (!byMat.has(o.material)) byMat.set(o.material, { meshes: [], mats: [] });
        const e = byMat.get(o.material);
        e.meshes.push(o);
        e.mats.push(m);
      } else if (!o.isMesh) walk(o, m);
    }
  };
  walk(root, new THREE.Matrix4());
  let saved = 0;
  for (const [mat, e] of byMat) {
    if (e.meshes.length < 2) continue;
    if (mergeInto(root, mat, e.meshes, e.mats)) saved += e.meshes.length - 1;
  }
  // drop groups left empty
  const prune = (node) => {
    for (const o of node.children.slice()) {
      prune(o);
      if (!o.isMesh && !o.isLine && !o.isPoints && !o.isSprite && o.type === 'Group' && !o.children.length && !keep.includes(o)) node.remove(o);
    }
  };
  prune(root);
  return saved;
}

export function mergeStatic(group, keep = []) {
  const byMat = new Map();
  for (const o of group.children) {
    if (!o.isMesh || keep.includes(o) || Array.isArray(o.material) || o.children.length) continue;
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(o);
  }
  let saved = 0;
  for (const [mat, meshes] of byMat) {
    if (meshes.length < 2) continue;
    let geos = meshes.map((m) => {
      m.updateMatrix();
      return bake(m.geometry, m.matrix);
    });
    // indexed and non-indexed geometries (extrusions) are merged as non-indexed; only the
    // attributes every geometry has are kept
    if (geos.some((g) => !g.index) && geos.some((g) => g.index)) geos = geos.map((g) => (g.index ? g.toNonIndexed() : g));
    const common = Object.keys(geos[0].attributes).filter((k) => geos.every((g) => g.attributes[k]));
    for (const g of geos) for (const k of Object.keys(g.attributes)) if (!common.includes(k)) g.deleteAttribute(k);
    for (const g of geos) for (const k of Object.keys(g.morphAttributes)) delete g.morphAttributes[k];
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue; // attribute sets differ: keep the meshes as they are
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = meshes.map((m) => m.name).filter(Boolean).join('+') || 'merged';
    mesh.castShadow = meshes.some((m) => m.castShadow);
    mesh.receiveShadow = meshes.some((m) => m.receiveShadow);
    for (const m of meshes) {
      group.remove(m);
      m.geometry.dispose();
    }
    group.add(mesh);
    saved += meshes.length - 1;
  }
  return saved;
}
