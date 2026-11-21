"use strict";

// Camera-space dimensions match the simulation. The artwork is rasterised at a fixed
// pixel pitch so the glass, animals and habitat stay registered when the tank resizes.
const VoxelHabitat = (() => {
  const WIDTH = 400, HEIGHT = 225, PIXEL = 3.2;
  const SW = 156, SH = 74, AX = 78, AY = 42;
  const TANK_SCALE = 3.15;
  const visibleSprites = [];
  const spriteCache = new Map(), modelFrames = new Map(), projections = new Map();
  let scene, background, backdropStage, burrow;
  const families = {
    kanahebi: "slender", yukikana: "slender", nihontokage: "skink", aojita: "skink", menashi: "skink",
    leopa: "gecko", jade: "gecko", yougan: "gecko", dokuyubi: "gecko",
    futoago: "bearded", erimaki: "frilled",
  };

  function canvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }

  function packed(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    s = Math.max(0, Math.min(1, s / 100));
    l = Math.max(.035, Math.min(.985, l / 100));
    const a = s * Math.min(l, 1 - l);
    const channel = n => {
      const k = (n + h * 12) % 12;
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return (255 << 24 | channel(4) << 16 | channel(8) << 8 | channel(0)) >>> 0;
  }

  function hexHsl(hex) {
    const c = parseInt(hex.slice(1), 16);
    const a = [c >> 16, (c >> 8) & 255, c & 255].map(v => v / 255);
    const max = Math.max(...a), min = Math.min(...a), d = max - min, l = (max + min) / 2;
    if (d === 0) return [0, 0, l * 100];
    const n = a.indexOf(max);
    const h = (n * 2 + (a[(n + 1) % 3] - a[(n + 2) % 3]) / d + 6) % 6;
    return [60 * h, 100 * d / (1 - Math.abs(2 * l - 1)), l * 100];
  }

  function palette(lz, hue, sat, light, traitKeys) {
    const albino = lz.morphId === "albino";
    const base = [hue, sat, light];
    const accent = [hue - 10, sat * .82, Math.max(9, light * .59)];
    const cream = [hue * .35 + 27, sat * .52, Math.min(89, light + 19)];
    const firstTrait = TRAITS[traitKeys[0]];
    const traits = traitKeys.map(key => TRAITS[key]).filter(Boolean);
    // Distinguish eyes, dorsal markings and the inherited throat/scale features across
    // every morph, including low-contrast melanistic and near-white albino individuals.
    const colors = [base, accent, cream, [44, 88, 62], [200, 23, 9], [55, 70, 94],
      (lz.speciesId === "aojita" || lz.speciesId === "nihontokage") ? [208, 80, 52] : [6, 62, 52],
      firstTrait ? hexHsl(firstTrait.rim) : [hue + 15, sat + 5, light + 8],
      albino ? [360, 62, 44] : [43, 88, 55],
      ...traits.slice(1).map(t => hexHsl(t.rim))];
    return colors.map(([h,s,l]) => [-11,-4,3,9].map(k => packed(h + (k > 0 ? 0 : -3), s, l + k)));
  }

  // Model in lizard-local coordinates: x noseward, y across the body, z up.
  // Overlapping ellipsoids and articulated segments are sampled into occupied voxels.
  function model(lz, family, pose, phase, tailLength, traitKeys, tongue, blink) {
    const cells = new Map(), details = [];
    const key = (x,y,z) => (x + 30) + (y + 15) * 64 + (z + 3) * 2048;
    let turnHead = false;
    function headPoint(x,y,z) {
      const reach=x-4;
      return [4+reach*.52-y*.8,reach*.8+y*.52,z];
    }
    function cell(x,y,z,m) {
      if (turnHead) [x,y,z]=headPoint(x,y,z).map(Math.round);
      cells.set(key(x,y,z), {x,y,z,m});
    }
    function oval(x,y,z,rx,ry,rz,material) {
      for (let i=Math.ceil(x-rx); i<=x+rx; i++) for (let j=Math.ceil(y-ry); j<=y+ry; j++) {
        const radial = ((i-x)/rx)**2 + ((j-y)/ry)**2;
        if (radial > 1) continue;
        const span = rz * Math.sqrt(1-radial);
        for (let k=Math.ceil(z-span); k<=z+span; k++) {
          cell(i,j,k,typeof material === "function" ? material(i,j,k) : material);
        }
      }
    }
    function limb(a,b,rad,mat) {
      const count = Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]) * 1.25);
      for (let i=0; i<=count; i++) {
        const t = i / Math.max(1,count);
        const p = a.map((v,k)=>Math.round(v+(b[k]-v)*t));
        cell(...p,mat);
        if (rad > 1) oval(...p,rad,rad,rad,mat);
      }
    }
    const id=lz.speciesId, gecko=family==="gecko", skink=family==="skink";
    const slim=family==="slender", beard=family==="bearded", frill=family==="frilled";
    const heavy=!slim && !frill && !gecko;
    const wave = Math.sin(phase * Math.PI / 2);
    const walk = pose === "walk", low = pose === "bask" || pose === "drink";
    // Fine surfaces (digits, lip seam and distal whip) sit below the size of
    // a model voxel. Rasterise these in the same camera as the solid limbs.
    function stroke(a,b,w0,w1,material,shade,side=0) {
      details.push({a:turnHead?headPoint(...a):a, b:turnHead?headPoint(...b):b,
        w0,w1,material,shade,side});
    }
    const skull = slim ? 11.6 : gecko ? 9 : 9.5;
    const nose = slim ? 18.6 : skink ? 13 : id === "komodo" ? 15 : 13.6;
    const mid = (skink || low ? 2.8 : 4.1) + (walk && phase % 2 ? .45 : 0);
    const neck = mid + (low ? 1.5 : pose === "look" ? 5.8 : slim ? 4.2 : 3.1);
    const width = slim ? 2.05 : beard || skink ? 3.15 : gecko ? 2.75 : 2.95;
    const flank = Math.round(mid + .7);
    const bodyColor = (x,y,z) => {
      if (z < mid-.65) return 2;
      if (traitKeys.length && z > mid + 1.5 && (x+10)%5===0) return 7;
      if (lz.pattern==="bands" || id==="tegu" || id==="aojita") return (x+18)%6<=1 ? 1 : 0;
      if (lz.pattern==="spots" || gecko || id==="mizuoo") {
        // A handful of coherent markings, large enough to read at tank resolution.
        const spot = (x+17+Math.floor((z-mid)*1.4))%6;
        return z>=mid && spot<2 && (Math.abs(y)>width*.5 || z>mid+1.3) ? 1 : 0;
      }
      if (lz.pattern==="stripe" || slim || id==="nihontokage") {
        if (Math.abs(y) >= width*.57 && z===flank) return 2;
        if (Math.abs(y) >= width*.74 && z===flank-1) return 1;
      }
      return 0;
    };
    // Elbows turn backwards and knees forwards. The long ankle-to-toe span
    // leaves open space between the belly and the four planted feet.
    for (const side of [-1,1]) for (const fore of [-1,1]) {
      const x = fore === 1 ? 4.4 : -5.1;
      const stride = walk ? wave * side * fore * 1.9 : 0;
      const knee = [x-fore*2.4+stride*.25, side*(width+1.65), mid*.55];
      const far = side*(width + (skink ? 2.5 : 3.8));
      const foot = [x+fore*1.35+stride, far, walk && stride>1 ? 1 : 0];
      limb([x,side*width*.62,mid],knee,heavy ? 1.4 : 1.14,0);
      limb(knee,foot,heavy ? 1.13 : 1,1);
      // The longest toes reach ahead and out from the heel; the innermost
      // digit hooks back. Fine individual claws leave gaps even on a phone.
      const footX=foot[0], footZ=foot[2];
      const toeLength=(gecko ? .86 : skink ? .82 : 1) * (fore===1 ? 1 : 1.22);
      for (const [dx,dy] of [[-1.7,2.9],[.45,4.4],[3.2,4.2],[4.15,1.75]]) {
        const tip=[footX+dx*toeLength,far+side*dy*toeLength,footZ-.25];
        const bend=[footX+dx*.50,far+side*(dy*.62+.45),footZ-.15];
        stroke(foot,bend,gecko?2.1:1.7,1.5,1,1,side);
        stroke(bend,tip,1.5,gecko?1.35:.75,1,1,side);
      }
    }
    const end = gecko ? -20 : skink ? -22 : slim ? -28 : -24;
    const long = (Math.abs(end)-5)*tailLength;
    const tailPoint = t => [
      -5-t*long,
      t*Math.sin(5.3*t+.65*wave)*(gecko?3.2:5.9)+(pose==="curl"?t*t*6:0),
      .65+(mid-1.25)*(1-t)**2+(pose==="curl"?t*t*3.7:1.8*t*t),
    ];
    const tailColor = (t,i) => id==="nihontokage" && t>.35 ? 6 :
      (gecko || lz.pattern==="bands") && i%6<2 ? 1 : 0;
    const taperAt = gecko ? .86 : .68;
    for (let i=0;i<=Math.ceil(long);i++) {
      const t=Math.min(1,i/Math.max(long,1));
      const p=tailPoint(t), mat=tailColor(t,i);
      if(t>taperAt) {
        const prev=tailPoint((i-1)/Math.max(long,1));
        const thin=u=>.8+3.7*Math.max(0,(1-u)/(1-taperAt));
        stroke(prev,p,thin((i-1)/long),thin(t),t>.90 && mat===0?1:mat,1);
      } else {
        const r=(gecko?1.85*(1-t)+1.6*Math.sin(t*Math.PI):2.2*(1-t))+.42;
        oval(p[0],Math.round(p[1]),Math.round(p[2]),1.18,Math.max(.64,r),Math.max(.67,r*.82),mat);
      }
    }
    oval(-1,0,mid,7,width,slim?1.95:2.5,bodyColor);
    oval(3.4,0,mid+.45,3.5,width*.87,1.9,bodyColor);
    turnHead=pose==="groom";
    limb([4,0,mid+.65],[skull-1.5,0,neck],slim?1.35:1.72,0);
    const cheek = beard || frill ? 3.3 : gecko ? 3.1 : skink ? 2.65 : slim ? 2.12 : 2.45;
    if (frill) {
      for (let a=0; a<40; a++) {
        const angle=a*Math.PI/20;
        limb([7,0,neck],[5,5.2*Math.cos(angle),neck+4.3*Math.sin(angle)],.75,a%5===0?2:1);
      }
    }
    if (beard) for (let j=-2; j<=2; j++) limb([8,j,neck-1],[6,j,neck-3.4+(Math.abs(j)===2?1:0)],.65,1);
    // High brow, wider cheek and a tapering wedge-shaped snout. A narrow dark
    // lip sits above the pale jaw; the eye is set behind it, under the brow.
    const headHeight=gecko?2.25:2.05;
    oval(skull,0,neck,3.1,cheek,headHeight,(x,y,z)=>z<neck-.6?2:0);
    for(let x=Math.round(skull); x<=Math.floor(nose); x++){
      const t=(x-skull)/(nose-skull);
      const yRadius=cheek*(1-(slim?.72:.58)*t);
      const zRadius=headHeight*(.88-.45*t);
      oval(x,0,neck-.28-.28*t,1.05,yRadius,zRadius,(vx,vy,vz)=>{
        if(vz<neck-.7) return 2;
        if(vz===Math.round(neck-.6) && Math.abs(vy)>=yRadius*.55) return 1;
        return 0;
      });
    }
    const ez=Math.round(neck+.5), eyeX = Math.round(skull);
    for (const side of [-1,1]) {
      const eyeY=side*Math.round(cheek);
      if (id!=="menashi") {
        cell(eyeX-1,eyeY,ez,1);
        cell(eyeX,eyeY,ez,blink?1:4);
        cell(eyeX+1,eyeY,ez,blink?1:8);
        cell(eyeX,side*(Math.abs(eyeY)-1),ez+1,2);
      }
      cell(Math.floor(nose)-1,side*Math.max(1,Math.round(cheek*.48)),Math.round(neck),1);
      if (traitKeys.length) cell(eyeX-2,eyeY,ez-1,7);
      const lip=[skull+1.1,side*(cheek-.22),neck-.45];
      const hinge=[nose-2,side*(cheek*.55),neck-.76];
      stroke(lip,hinge,1.5,1.15,1,0,side);
      stroke(hinge,[nose+.4,side*.64,neck-.56],1.15,.75,1,0,side);
      if (!blink && id!=="menashi") {
        const glint=[eyeX+.03,eyeY,ez+.30];
        stroke(glint,glint,1.05,1.05,5,2,side);
      }
    }
    if (tongue) {
      const tip = [Math.round(nose)+3,0,Math.round(neck-1.5)];
      limb([nose,0,Math.round(neck-.8)],tip,.5,6);
      if (!skink) for(const side of [-1,1]) cell(tip[0]+1,side,tip[2],6);
    }
    turnHead=false;
    if (beard || ["ancient","blackdragon","ishigami","hakugin"].includes(id)) {
      for (let i=-4; i<=4; i+=2) cell(i,0,Math.round(mid+2.45),id==="ancient"?3:1);
    }
    for (let i=1;i<traitKeys.length;i++) cell(2-i*2,0,Math.round(mid+2),8+i);
    return { cells, key, details };
  }

  // The three visible faces of every unit cube share one projection. Rasterise their
  // coverage at quarter-pixel origins once per camera angle, then stamp exposed faces.
  function camera(yaw) {
    if (projections.has(yaw)) return projections.get(yaw);
    const co=Math.cos(yaw), si=Math.sin(yaw), unit=2.42;
    const vx=si>=0 ? 1 : -1, vy=co>=0 ? 1 : -1;
    const a=vx*.5,b=vy*.5;
    const faces=[
      { offset:vx, shade:vx*co<0 ? 2:0, points:[[a,-.5,-.5],[a,.5,-.5],[a,.5,.5],[a,-.5,.5]] },
      { offset:vy*64, shade:-vy*si<0 ? 2:1, points:[[-.5,b,-.5],[.5,b,-.5],[.5,b,.5],[-.5,b,.5]] },
      { offset:2048, shade:3, points:[[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]] },
    ];
    for(const face of faces) {
      face.masks=[];
      for(let fy=0;fy<4;fy++)for(let fx=0;fx<4;fx++) {
        const pts=face.points.map(([x,y,z])=>[(x*co-y*si)*unit+fx/4, ((x*si+y*co)*.47-z*.88)*unit+fy/4]);
        const mask=[];
        for(let iy=-3;iy<=3;iy++) {
          const scan=iy+.5;
          let left=4, right=-4;
          for(let k=0;k<4;k++){
            const p=pts[k], q=pts[(k+1)%4];
            if((p[1]>scan)===(q[1]>scan))continue;
            const at=p[0]+(scan-p[1])*(q[0]-p[0])/(q[1]-p[1]);
            left=Math.min(left,at);right=Math.max(right,at);
          }
          for(let ix=Math.ceil(left-.5);ix<right-.5;ix++)mask.push(iy*SW+ix);
        }
        face.masks.push(mask);
      }
    }
    const cam={co,si,unit,faces};
    projections.set(yaw,cam);
    return cam;
  }

  function bake(data,yaw) {
    const {co,si,unit,faces}=camera(yaw), indices=new Uint8Array(SW*SH);
    const order=[...data.cells.values()];
    for(const v of order) {
      v.depth=(v.x*si+v.y*co)*.88+v.z*.47;
      v.key=data.key(v.x,v.y,v.z);
    }
    order.sort((a,b)=>a.depth-b.depth);
    for(const v of order) {
      const fx=Math.round((AX+(v.x*co-v.y*si)*unit)*4);
      const fy=Math.round((AY+((v.x*si+v.y*co)*.47-v.z*.88)*unit)*4);
      const center=(fx>>2)+(fy>>2)*SW, sub=(fx&3)+(fy&3)*4;
      for(const face of faces) {
        if(data.cells.has(v.key+face.offset)) continue;
        const ink=1+v.m*4+face.shade;
        for(const offset of face.masks[sub]) indices[center+offset]=ink;
      }
    }
    const project=([x,y,z])=>[AX+(x*co-y*si)*unit,AY+((x*si+y*co)*.47-z*.88)*unit];
    for(const d of data.details) {
      const [x0,y0]=project(d.a), [x1,y1]=project(d.b);
      const steps=Math.max(1,Math.ceil(Math.hypot(x1-x0,y1-y0)*1.7));
      const far=d.side && d.side*co < 0;
      for(let k=0;k<=steps;k++) {
        const t=k/steps,x=x0+(x1-x0)*t,y=y0+(y1-y0)*t;
        const rad=(d.w0+(d.w1-d.w0)*t)*.5;
        // 128 identifies a fine feature that already carries its own edge ink.
        const ink=128+1+d.material*4+d.shade;
        const ix=Math.round(x),iy=Math.round(y);
        if (!far || !indices[iy*SW+ix]) indices[iy*SW+ix]=ink;
        for(let yy=Math.ceil(y-rad);yy<=y+rad;yy++) for(let xx=Math.ceil(x-rad);xx<=x+rad;xx++) {
          const i=yy*SW+xx;
          if((xx-x)**2+(yy-y)**2<=rad*rad && (!far || !indices[i])) indices[i]=ink;
        }
      }
    }
    return indices;
  }

  function tint(indices,colors,edge) {
    const c=canvas(SW,SH), ctx=c.getContext("2d");
    const image=ctx.createImageData(SW,SH), out=new Uint32Array(image.data.buffer);
    const palette=[0,...colors.flat()];
    for (let i=0;i<indices.length;i++) {
      if (indices[i]) out[i]=palette[indices[i]&127];
      else if ((indices[i-1]||255)<128 || (indices[i+1]||255)<128 ||
               (indices[i-SW]||255)<128 || (indices[i+SW]||255)<128) out[i]=edge;
    }
    ctx.putImageData(image,0,0);
    return { canvas:c, mask:indices };
  }

  function drawLizard(ctx,lz,inTank) {
    const species=speciesById(lz.speciesId);
    if (!species) return;
    const reduced=typeof Motion!=="undefined" && Motion.reduced;
    const t=reduced?0:Render.time;
    const phaseTime=t+(lz.id%71)*.81;
    const resting=lz._relaxPose || lz._spotPosture;
    const pose=lz.moving?"walk":resting==="drink"?"drink":resting==="curl"?"curl":resting==="groom"?"groom":
      lz.injuredT>0 || resting==="bask" || resting==="lounge"?"bask":
      resting==="lookout" || resting==="lookup" || Math.floor(phaseTime/4)%4===2?"look":"idle";
    const phase=reduced?0:Math.floor(phaseTime*(lz.moving?5.5:1.1))%4;
    const blink=!reduced && phaseTime%5.6<.19;
    const tongue=!reduced && !blink && (pose==="groom" ? phase%2===0 : phaseTime%4.75<.45);
    const angle=Number.isFinite(lz.angle)?lz.angle:0;
    const side=Math.cos(angle)>=0?1:-1;
    // Keep the head and tail legible when travelling directly towards/away from the glass.
    const sin=Math.sin(angle);
    const yaw=(side===1?0:Math.PI)+side*(sin<-.48?-.55:sin>.48?.55:sin>=0?.24:-.24);
    const tail=lz.injuredT>0?Math.max(.12,Math.round((1-lz.injuredT/CFG.injuryTime)*4)/4):1;
    const gene=Render.lizardColor(lz);
    const hue=lz.morphId==="legendary"?Math.round(gene.h/24)*24:Math.round(gene.h);
    const traits=(lz.traits||[]).map(t=>typeof t==="string"?t:t.key).filter(k=>TRAITS[k]);
    const signature=[species.id,lz.morphId,lz.pattern,hue,gene.s,gene.l,...traits,yaw,pose,phase,tail,+blink,+tongue].join("/");
    let sprite=spriteCache.get(signature);
    if (!sprite) {
      const shapeKey=[species.id,lz.pattern,yaw,pose,phase,tail,traits.length,+blink,+tongue].join("/");
      let frame=modelFrames.get(shapeKey);
      if(!frame) {
        const data=model(lz,families[species.id]||"monitor",pose,phase,tail,traits,tongue,blink);
        frame=bake(data,yaw);
        if(modelFrames.size>=768) modelFrames.delete(modelFrames.keys().next().value);
        modelFrames.set(shapeKey,frame);
      }
      sprite=tint(frame,palette(lz,hue,gene.s,gene.l,traits),packed(hue-9,gene.s*.60,Math.max(12,Math.min(30,gene.l*.46))));
      if(spriteCache.size>=512) spriteCache.delete(spriteCache.keys().next().value);
      spriteCache.set(signature,sprite);
    }
    const scale=species.size*(lz.stage==="baby"?.57:1)*Game.crowdScale()*(inTank?TANK_SCALE:1.55);
    ctx.save();ctx.imageSmoothingEnabled=false;
    const bob= !reduced && !lz.moving && Math.sin(phaseTime*1.6)>.65 ? scale*.45 : 0;
    ctx.fillStyle="rgba(37,39,27,.23)";
    ctx.beginPath();ctx.ellipse(lz.x-1,lz.y+2,scale*18,scale*4.5,0,0,Math.PI*2);ctx.fill();
    const left=lz.x-AX*scale, top=lz.y-AY*scale-bob;
    ctx.drawImage(sprite.canvas,left,top,SW*scale,SH*scale);
    if (inTank && ctx.canvas===scene) visibleSprites.push({lz,mask:sprite.mask,left,top,scale});
    ctx.restore();
  }

  // Hit the same silhouette last drawn on the glass, including an extended snout
  // or curling tail. Reverse painter order resolves overlapping residents.
  function pickLizard(x,y,touchRadius = 0) {
    // All exact hits take priority over the extra finger allowance on small residents.
    for (const precise of [true,false]) {
      for(let i=visibleSprites.length-1;i>=0;i--) {
        const {lz,mask,left,top,scale}=visibleSprites[i];
        const pad = precise ? 0 : Math.max(2, Math.ceil(touchRadius / scale));
        const px=Math.floor((x-left)/scale), py=Math.floor((y-top)/scale);
        if (px < -pad || py < -pad || px >= SW+pad || py >= SH+pad) continue;
        for(let yy=Math.max(0,py-pad); yy<=Math.min(SH-1,py+pad); yy++)
          for(let xx=Math.max(0,px-pad); xx<=Math.min(SW-1,px+pad); xx++)
            if (mask[yy*SW+xx]) return lz;
      }
    }
    return null;
  }

  function polygon(c,points,color) {
    c.fillStyle=color; c.beginPath(); c.moveTo(...points[0]);
    for(let i=1;i<points.length;i++) c.lineTo(...points[i]);
    c.closePath();c.fill();
  }
  const brass=["#e8c57b","#b38854","#6b6249"];
  const wood=["#aa8c62","#806f52","#574e43"];
  const stone=["#cdb68e","#a18c70","#827460"];
  function block(c,x,y,w,d,h,colors) {
    const a=[x,y-h-d*.45],b=[x+w/2,y-h],e=[x,y-h+d*.45],f=[x-w/2,y-h];
    polygon(c,[f,e,[e[0],e[1]+h],[f[0],f[1]+h]],colors[1]);
    polygon(c,[e,b,[b[0],b[1]+h],[e[0],e[1]+h]],colors[2]);
    polygon(c,[a,b,e,f],colors[0]);
  }

  function burrowProp(c) {
    const openings=Render.burrowEntrances(Game.nestLv());
    for(const e of openings){
      const x=e.x/PIXEL,y=e.y/PIXEL;
      c.fillStyle="rgba(67,55,38,.23)";c.fillRect(x-20,y,43,3);
      if(burrow.complete && burrow.naturalWidth) {
        c.drawImage(burrow,x-25,y-22,49,26);
      } else {
        block(c,x-7,y,32,17,9,stone);
        block(c,x+12,y-1,18,13,11,stone);
        block(c,x,y-7,36,16,6,["#dfc89b","#b6a07f","#927d68"]);
        polygon(c,[[x-6,y+2],[x-6,y-3],[x-3,y-7],[x+2,y-7],[x+6,y-3],[x+6,y+2]],"#433e33");
      }
    }
  }

  function nursery(c) {
    const x=NEST.x/PIXEL,y=NEST.y/PIXEL;
    // Low ring of split wood. Eggs retain the exact same hit positions as the hatchery.
    const outer=[[-14,0],[-9,-4],[7,-4],[14,-1],[14,2],[8,5],[-8,5],[-14,2]];
    const face=(outline,dy,color)=>polygon(c,outline.map(([px,py])=>[x+px,y+py+dy]),color);
    face(outer,1.5,"#aa8965");
    face(outer,0,"#b38e59");
    face([[-10,0],[-6,-3],[6,-3],[11,0],[6,2],[-6,2]],0,"#8c7253");
    for(const [dx,dy,w] of [[-12,0,4],[-7,-3,4],[4,-3,4],[9,0,4],[-9,3,5],[3,3,4],[-3,4,5]]) {
      c.fillStyle="#dac083";c.fillRect(Math.round(x+dx),Math.round(y+dy),w,1);
    }
    for(let i=0;i<Game.state.eggs.length;i++){
      const egg=Game.state.eggs[i], ex=(NEST.x-24+i*24)/PIXEL, ey=(NEST.y+1)/PIXEL;
      const wiggle=egg.t<8 && egg.t>0 && !(typeof Motion!=="undefined" && Motion.reduced)?Math.round(Math.sin(Render.time*9+i)):0;
      c.save();c.translate(ex+wiggle,ey);
      const tones=egg.lucky?["#d5bbec","#bd7eab","#8e729f"]:["#faecd0","#dac9a8","#b79979"];
      block(c,0,1,7,6,5,tones);block(c,-.3,-3,5,4,2,tones);
      c.fillStyle="#fff4cc";c.fillRect(-1,-6,2,2);
      c.restore();
    }
  }

  function facility(c,id,level) {
    const p=id==="heat"?FAC_POS.light:FAC_POS[id];
    const x=id==="fence"?FAC_POS.fenceX/PIXEL:p.x/PIXEL;
    const y=id==="fence"?0:p.y/PIXEL;
    const size=1+Math.min(.65,(level-1)*.047);
    c.save(); c.translate(x,y); c.scale(size,size);
    if(id==="water") {
      const rim=["#b8b593","#888d74","#63786a"];
      block(c,0,1,39,25,3,rim);
      block(c,0,-1,33,20,2,["#84b9a8","#58908d","#478885"]);
      c.fillStyle="#c0dac0";c.fillRect(-8,-4,7,1);c.fillRect(4,1,6,1);
    } else if(id==="heat") {
      block(c,0,0,27,19,2,stone);
      block(c,8,-1,4,4,28,wood);
      block(c,3,-29,15,3,2,brass);
      block(c,-3,-24,10,9,4,brass);
      c.fillStyle="#ffe69e"; c.fillRect(-6,-24,6,2);
    } else if(id==="fence") {
      for(let yy=76;yy<213/size;yy+=12){
        block(c,1,yy-2,4,10,4,wood);
        block(c,0,yy,4,4,13,wood);
      }
    } else if(id==="trap") {
      block(c,0,0,17,12,3,stone);
      for(let k=-1;k<2;k++){
        block(c,k*4,-2,3,3,5,brass);
      }
    } else {
      const height=id==="observatory"?27:20;
      for(const dx of [-7,7]) for(const dy of [-3,3]) block(c,dx,dy,4,4,height,wood);
      block(c,0,-height,26,18,3,wood);
      block(c,0,-height-2,16,11,9,["#a5b7a0","#517b72","#3f6765"]);
      block(c,0,-height-11,26,18,3,brass);
      c.fillStyle="#e5d5a6";c.fillRect(-5,-height-10,3,3);
    }
    c.restore();
  }

  function drawScene(render) {
    const stage=Game.currentStage();
    if(!scene) {
      scene=canvas(WIDTH,HEIGHT);
      burrow=new Image();
      burrow.src=INK_RELIEFS.burrow;
    }
    if(!background || backdropStage!==stage.id) {
      backdropStage=stage.id;
      background=canvas(WIDTH,HEIGHT);
      VoxelLandscape.paint(background.getContext("2d"),stage);
      render._stageBoulders=VoxelLandscape.perches || [];
    }
    const c=scene.getContext("2d");
    c.setTransform(1,0,0,1,0,0); c.imageSmoothingEnabled=false;
    c.drawImage(background,0,0);
    if (!(typeof Motion!=="undefined" && Motion.reduced)) VoxelLandscape.animate(c,stage,render.time);
    c.scale(1/PIXEL,1/PIXEL);
    if (typeof Weather!=="undefined") {
      render._wx=Weather.now(stage.id,Game._motClock||0);
      Weather.drawSky(c,W,H,render._wx,FIELD.y1,FIELD.y2);
    }
    render.drawAutotomyTails(c);
    const objects=[
      { y:FAC_POS.burrow.y, draw:burrowProp },
      { y:NEST.y+8, draw:nursery },
    ];
    for(const id of ["water","heat","observatory","fence","watchtower","trap"]) {
      const lv=Game.facLv(id);
      if(lv) objects.push({y:id==="fence"?FIELD.y1:(id==="heat"?FAC_POS.light:FAC_POS[id]).y,
        draw:ctx=>facility(ctx,id,lv)});
    }
    for(const lz of Game.state.lizards) if(Game.isVisible(lz)) objects.push({y:lz.y,lz});
    objects.sort((a,b)=>a.y-b.y);
    visibleSprites.length=0;
    for(const o of objects) {
      if(o.lz) {
        drawLizard(c,o.lz,true);
        render._paintLizardState(c,o.lz);
      } else {
        c.save();c.setTransform(1,0,0,1,0,0);o.draw(c);c.restore();
      }
    }
    if(typeof Weather!=="undefined") render._wxParts=Weather.drawParticles(c,W,H,render.time,render._wx,FIELD.y1,FIELD.y2);
    return c;
  }
  function present(target) {
    target.save();target.imageSmoothingEnabled=false;target.drawImage(scene,0,0,W,H);target.restore();
  }
  return { drawScene, drawLizard, pickLizard, present };
})();
