/**
 * Bodies drawn as stand-ins until the characters workstream's Bodies3D (view3d/bodies*, branch p3d-bodies) lands: a
 * capsule per body in its seat's colour (enemies red, dummies grey), with a nose showing which way it faces. View3D
 * talks to it only through BodiesLayer, so swapping in the real models is one line in view3d.ts.
 */
import * as THREE from 'three';
import { KIND, MAX_BODIES, MAX_SEATS, type World } from '@wizard-sim/sim';

/** Where body i is drawn this frame: scene x, ground height y, scene z (u), and its facing in turns. */
export type BodyAt = (i: number) => { x: number; y: number; z: number; face: number };

/** What View3D needs of whatever draws the bodies. */
export interface BodiesLayer {
  readonly root: THREE.Object3D;
  /** Pose and place every body for this frame. */
  draw(w: World, at: BodyAt, now: number): void;
  /** The drawn top of body i (u above its feet), for fading what stands in front of it. */
  heightOf(w: World, i: number): number;
}

/** Seat colours: blue, amber, green, violet. */
const SEAT = [0x4f86ff, 0xffa53a, 0x52c873, 0xc061e0];
/** Heights (u): a wizard is 2.9 u (kit3d.ts's scale wizard), a goblin a little shorter. */
const WIZ_H = 2.9, ENEMY_H = 2.2;

export class StandInBodies implements BodiesLayer {
  readonly root = new THREE.Group();
  private meshes: THREE.Group[] = [];
  private mats = {
    seat: SEAT.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 })),
    enemy: new THREE.MeshStandardMaterial({ color: 0xc8332b, roughness: 0.6 }),
    dummy: new THREE.MeshStandardMaterial({ color: 0x9a9488, roughness: 0.8 }),
    nose: new THREE.MeshStandardMaterial({ color: 0xf2eee6, roughness: 0.5 }),
  };
  private geo = new THREE.CapsuleGeometry(0.5, 1, 4, 12);
  private noseGeo = new THREE.ConeGeometry(0.18, 0.5, 8).rotateZ(-Math.PI / 2);

  constructor() {
    for (let i = 0; i < MAX_BODIES; i++) {
      const g = new THREE.Group(), body = new THREE.Mesh(this.geo, this.mats.dummy), nose = new THREE.Mesh(this.noseGeo, this.mats.nose);
      body.castShadow = nose.castShadow = true;
      g.add(body, nose); g.visible = false;
      this.meshes.push(g); this.root.add(g);
    }
  }

  heightOf(w: World, i: number): number { return w.bodies.kind[i] === KIND.enemy ? ENEMY_H : WIZ_H; }

  draw(w: World, at: BodyAt): void {
    const b = w.bodies;
    for (let i = 0; i < MAX_BODIES; i++) {
      const g = this.meshes[i], k = b.kind[i];
      if (!k || (i < MAX_SEATS && k === KIND.wizard && !w.seats.active[i])) { g.visible = false; continue; }
      const p = at(i), r = Math.max(0.3, b.r[i]), h = this.heightOf(w, i);
      const [body, nose] = g.children as THREE.Mesh[];
      body.material = k === KIND.enemy ? this.mats.enemy : k === KIND.dummy ? this.mats.dummy : this.mats.seat[(k === KIND.double ? i % MAX_SEATS : i) % SEAT.length];
      // the capsule is 2 u tall at scale 1 (1 u body and two 0.5 u caps): stretch it to h, widen it to the body's radius
      body.scale.set(r / 0.5, h / 2, r / 0.5); body.position.y = h / 2;
      nose.position.set(r + 0.1, h * 0.72, 0);
      g.rotation.y = -p.face * Math.PI * 2;
      // a downed wizard lies flat
      g.rotation.z = i < MAX_SEATS && b.downed[i] ? Math.PI / 2 : 0;
      g.position.set(p.x, p.y, p.z);
      g.visible = true;
    }
  }
}
