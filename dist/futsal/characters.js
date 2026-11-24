/* Blocky low-poly footballers built from boxes only (no textures, no model files).
   Model faces +x, total height 2.0 units before ROOT_SCALE. Each rig part (body, two legs, two arms) is ONE
   merged mesh with vertex colours, so a player costs 5 draw calls. One shared MeshLambertMaterial for everyone;
   merged geometries are cached and shared between identical players. Limb groups pivot at the hip and
   shoulder joints and swing around z for the run cycle. */
export const KITS={
  club:{shirt:0x202329,trim:0xb6ff28,shorts:0x202329,socks:0x202329,sockBand:0xb6ff28,boots:0x15171a,sole:0xb6ff28,gkShirt:0xb6ff28,gkTrim:0x202329,gloves:0xf2f2ec},
  clubWhite:{shirt:0xeef0ea,trim:0x202329,shorts:0xeef0ea,socks:0xeef0ea,sockBand:0x202329,boots:0x15171a,sole:0x202329,gkShirt:0xff7a2f,gkTrim:0x202329,gloves:0xf2f2ec},
  rivalHome:{shirt:0xc8352e,trim:0xf2f2ec,shorts:0xf2f2ec,socks:0xc8352e,sockBand:0xf2f2ec,boots:0x15171a,sole:0xf2f2ec,gkShirt:0x2f6fd0,gkTrim:0xf2f2ec,gloves:0xf2f2ec},
  rivalAway:{shirt:0x2f6fd0,trim:0xf2f2ec,shorts:0x2f6fd0,socks:0x2f6fd0,sockBand:0xf2f2ec,boots:0x15171a,sole:0xf2f2ec,gkShirt:0xffc531,gkTrim:0x15171a,gloves:0xf2f2ec}
};
export const BUILDS={slim:{w:0.88,leg:1.05,label:'슬림형'},base:{w:1,leg:1,label:'기본형'},sturdy:{w:1.16,leg:0.96,label:'튼튼형'}};
export const SKIN=[0xf0c9a2,0xe6b88f,0xdcaa82,0xf3d0ae,0xd6a27a];
export const HAIR=[0x34363b,0x2b2d31,0x3b3d42,0x27282c];
export const ROOT_SCALE=0.875; // 2.0 units tall -> 1.75, the size the game was tuned for
/* stat-driven body type: quick players look slim, strong players look sturdy */
export function buildFor(field){if(!field)return 'base';const d=(field.PHY||60)-(field.PAC||60);return d>=8?'sturdy':d<=-8?'slim':'base';}

export function createCharacters(THREE){
  const material=new THREE.MeshLambertMaterial({vertexColors:true});
  const unit=new THREE.BoxGeometry(1,1,1).toNonIndexed();
  const star=(()=>{const s=new THREE.Shape();for(let i=0;i<10;i++){const r=i%2?0.45:1,a=Math.PI/2+i*Math.PI/5;i?s.lineTo(Math.cos(a)*r,Math.sin(a)*r):s.moveTo(Math.cos(a)*r,Math.sin(a)*r);}s.closePath();return new THREE.ShapeGeometry(s).rotateY(Math.PI/2).toNonIndexed();})();
  const col=new THREE.Color(),m4=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler();
  // part list -> one merged non-indexed geometry with a colour per vertex
  function merge(parts){
    let n=0;for(const p of parts)n+=(p.g||unit).attributes.position.count;
    const pos=new Float32Array(n*3),nor=new Float32Array(n*3),cols=new Float32Array(n*3);let o=0;
    for(const p of parts){
      const g=p.g||unit;e.set(p.rx||0,p.ry||0,p.rz||0);q.setFromEuler(e);
      m4.compose(new THREE.Vector3(p.x||0,p.y||0,p.z||0),q,new THREE.Vector3(p.sx,p.sy,p.sz));
      const nm=new THREE.Matrix3().getNormalMatrix(m4);col.setHex(p.c);
      const P=g.attributes.position,N=g.attributes.normal,v=new THREE.Vector3();
      for(let i=0;i<P.count;i++,o++){
        v.fromBufferAttribute(P,i).applyMatrix4(m4);pos.set([v.x,v.y,v.z],o*3);
        v.fromBufferAttribute(N,i).applyMatrix3(nm).normalize();nor.set([v.x,v.y,v.z],o*3);
        cols.set([col.r,col.g,col.b],o*3);
      }
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('normal',new THREE.BufferAttribute(nor,3));g.setAttribute('color',new THREE.BufferAttribute(cols,3));
    g.computeBoundingSphere();return g;
  }
  // box helper: size (depth along x, height, width along z), centre, colour
  const box=(d,h,w,x,y,z,c,extra={})=>({sx:d,sy:h,sz:w,x,y,z,c,...extra});
  const cache=new Map();
  const cached=(key,fn)=>{if(!cache.has(key))cache.set(key,merge(fn()));return cache.get(key);};

  // joint heights (unscaled, 2.0 tall figure)
  const HIP=0.80,SHOULDER=1.39,NECK=1.45;
  function bodyParts(K,gk,B,cap,skin,hair){
    const w=B.w,shirt=gk?K.gkShirt:K.shirt,P=[];
    // torso 0.35 deep x 0.65 tall x 0.67 wide, sits on the hips
    P.push(box(0.35*w,0.67,0.67*w,0,HIP+0.335-0.02,0,shirt));
    if(K.uniform){
      P.push(box(0.37*w,0.07,0.69*w,0,HIP+0.07,0,K.belt));                 // belt
      P.push(box(0.03,0.08,0.11,0.185*w+0.005,HIP+0.07,0,K.buckle));          // buckle
      for(const s of [-1,1])P.push(box(0.15,0.035,0.12,0,NECK+0.005,s*0.24*w,K.trim)); // red shoulder boards
      P.push(box(0.36*w,0.07,0.68*w,0,HIP-0.01,0,K.trousers));             // trouser top under the jacket
    }else{
      const t=gk?K.gkTrim:K.trim;
      for(const s of [-1,1])P.push(box(0.36*w,0.62,0.03,0,HIP+0.33,s*0.335*w,t));  // side stripes
      P.push(box(0.36*w,0.04,0.25,0,NECK-0.02,0,t));                               // collar
      P.push(box(0.37*w,0.16,0.69*w,0,HIP+0.02,0,K.shorts));                        // shorts waist
    }
    P.push(box(0.16,0.08,0.18,0,NECK+0.03,0,skin));                                 // neck
    const HY=NECK+0.07+0.24;P.push(box(0.46,0.48,0.50,0,HY,0,skin));               // head (no face)
    if(cap){
      P.push(box(0.48,0.08,0.52,-0.005,HY+0.20,0,K.cap));                          // band
      P.push(box(0.56,0.13,0.58,-0.01,HY+0.30,0,K.cap));                           // flat top crown
      P.push(box(0.17,0.03,0.46,0.30,HY+0.17,0,0x161616,{rz:-0.12}));               // peak
      P.push({g:star,sx:1,sy:0.05,sz:0.05,x:0.271,y:HY+0.30,z:0,c:0xe04740});      // small red star
    }else{
      P.push(box(0.53,0.12,0.54,-0.015,HY+0.25,0,hair));                             // hair top
      P.push(box(0.12,0.36,0.54,-0.21,HY+0.09,0,hair));                             // back
      for(const s of [-1,1])P.push(box(0.30,0.16,0.04,-0.06,HY+0.13,s*0.26,hair));  // sides
      P.push(box(0.07,0.07,0.52,0.22,HY+0.17,0,hair));                               // fringe
    }
    return P;
  }
  function legParts(K,gk,B){
    const w=B.w,L=0.72*B.leg,P=[];
    if(K.uniform){
      P.push(box(0.21,L-0.12,0.20*w,0,-(L-0.12)/2,0,K.trousers));
      P.push(box(0.22,0.20,0.21*w,0,-L+0.06,0,K.boots));                                 // boot shaft
    }else{
      P.push(box(0.23,0.26,0.24*w,0,-0.13,0,K.shorts));                                   // shorts leg
      P.push(box(0.17,0.12,0.17,0,-0.31,0,0xd9ad86));                                     // knee (skin tone kept neutral)
      P.push(box(0.18,L-0.40,0.18,0,-0.37-(L-0.40)/2,0,K.socks));                         // sock
      P.push(box(0.185,0.05,0.185,0,-0.40,0,K.sockBand));
    }
    // foot 0.39 long x 0.13 tall x 0.23 wide, toe forward (+x)
    P.push(box(0.39,0.13,0.23,0.07,-L-0.065+0.02,0,K.boots));
    if(!K.uniform)P.push(box(0.40,0.025,0.235,0.07,-L-0.12,0,K.sole));
    return P;
  }
  function armParts(K,gk,B,skin){
    const w=B.w,shirt=gk?K.gkShirt:K.shirt,P=[];
    if(K.uniform){
      P.push(box(0.16*w,0.46,0.16*w,0,-0.23,0,shirt));
      P.push(box(0.13,0.12,0.13,0,-0.52,0,gk?0x1f1f1f:skin));
    }else{
      P.push(box(0.17*w,0.22,0.17*w,0,-0.11,0,shirt));
      P.push(box(0.175*w,0.035,0.175*w,0,-0.215,0,gk?K.gkTrim:K.trim));
      P.push(box(0.14,0.24,0.14,0,-0.35,0,gk?shirt:skin));
      P.push(box(0.14,0.12,0.14,0,-0.52,0,gk?K.gloves:skin));
    }
    return P;
  }
  function build({kit='club',gk=false,body='base',cap=null,skin=SKIN[0],hair=HAIR[0]}={}){
    const K=KITS[kit]||KITS.club,B=BUILDS[body]||BUILDS.base;const wearCap=cap??(!!K.uniform&&!gk);
    const key=[kit,gk?1:0,body,wearCap?1:0,skin,hair].join(':');
    const root=new THREE.Group(),body3=new THREE.Group(),inner=new THREE.Group();
    inner.scale.setScalar(ROOT_SCALE);root.add(inner);inner.add(body3);
    const mesh=g=>{const m=new THREE.Mesh(g,material);m.castShadow=false;m.receiveShadow=false;return m;};
    body3.add(mesh(cached('b:'+key,()=>bodyParts(K,gk,B,wearCap,skin,hair))));
    const limbs={};
    for(const side of [-1,1]){
      const leg=new THREE.Group();leg.position.set(0,HIP+(B.leg-1)*0.72,side*0.17*B.w);
      leg.add(mesh(cached('l:'+[kit,body].join(':'),()=>legParts(K,gk,B))));body3.add(leg);limbs[side<0?'legL':'legR']=leg;
      const arm=new THREE.Group();arm.position.set(0,SHOULDER+(B.leg-1)*0.72,side*(0.335*B.w+0.085*B.w));
      arm.add(mesh(cached('a:'+[kit,gk?1:0,body,skin].join(':'),()=>armParts(K,gk,B,skin))));body3.add(arm);limbs[side<0?'armL':'armR']=arm;
    }
    // longer legs lift the whole upper body
    body3.children[0].position.y=(B.leg-1)*0.72;
    return {root,body:body3,limbs,height:(2.0+(B.leg-1)*0.72+(wearCap?0.08:0))*ROOT_SCALE};
  }
  return {build,material};
}

/* Studio-style image based lighting built in code (no texture downloads). */
export function makeEnvironment(THREE,renderer){
  const s=new THREE.Scene();
  const sky=new THREE.Mesh(new THREE.SphereGeometry(20,32,16),new THREE.MeshBasicMaterial({side:THREE.BackSide,vertexColors:true}));
  const pos=sky.geometry.attributes.position,col=[];for(let i=0;i<pos.count;i++){const y=pos.getY(i)/20;const c=new THREE.Color().setHSL(0.6,0.15,0.18+Math.max(0,y)*0.55);col.push(c.r,c.g,c.b);}
  sky.geometry.setAttribute('color',new THREE.Float32BufferAttribute(col,3));s.add(sky);
  const panel=(w,h,x,y,z,i)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(i,i,i),side:THREE.DoubleSide}));m.position.set(x,y,z);m.lookAt(0,0,0);s.add(m);};
  panel(12,4,0,16,0,3.2);panel(8,6,10,6,8,1.6);panel(8,6,-10,5,-8,1.1);panel(10,3,0,4,-14,0.9);
  const pm=new THREE.PMREMGenerator(renderer);const env=pm.fromScene(s,0.04).texture;pm.dispose();return env;
}
