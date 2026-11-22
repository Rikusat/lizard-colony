"use strict";

// An orthographic pixel diorama. All terrain and foliage share the same two-to-one
// projection. The scene is painted once per planet by the habitat renderer.
const VoxelLandscape = (() => {
  const width = 400, height = 225;
  const perches = [
    { x: 742, y: 370, r: 28 }, { x: 1005, y: 553, r: 35 }, { x: 304, y: 424, r: 23 },
  ];
  // Sky, haze, distant ridge, sandstone, earth, shade, foliage, sunlit leaves, water.
  const palettes = [
    ["5aadae","ffdfaa","999c98","b66d49","e5bf89","9c765f","286650","9eaa62","469d98"],
    ["50516e","d6aba8","83787f","8c7068","aaa091","736f7e","3d6261","a49b76","548a9b"],
    ["62929b","dce5ae","88aa97","817957","c0bc83","748064","285d52","9eb765","539d98"],
    ["849a9a","ecddba","9bae9e","917758","c1b891","7e8370","38685a","9ca56f","5e9c99"],
    ["7c696d","e6ae84","ad8375","795c59","b28a73","735e62","505949","99935e","dc8152"],
    ["438789","cde1ab","79a593","877963","b4b57d","6c7c60","205b51","a7ba62","4aa294"],
    ["32677b","80b1ad","4c8893","587a7b","9db7aa","5d8b8b","275c70","7cae99","428598"],
    ["7397b2","e1edf0","a2bac5","88a9b6","d8e3dd","a2bac2","4a7179","9fb7a0","6aafbd"],
    ["505e69","bac2b2","849597","637276","9baba1","6c827f","435d5e","909e7b","6aa8a4"],
    ["aa8777","fae0ad","bea58e","a77952","d2b786","958675","486d57","a5ad6b","569a93"],
  ];
  const color = hex => parseInt(hex, 16);
  function mix(a, b, ratio) {
    const between = shift => Math.round(((a >> shift) & 255) * (1 - ratio) + ((b >> shift) & 255) * ratio);
    return (between(16) << 16) | (between(8) << 8) | between(0);
  }
  function rng(seed) {
    let n = seed >>> 0;
    return () => ((n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296);
  }
  function hash(a, b) {
    let n = Math.imul(a, 374761393) + Math.imul(b, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  function raster(ctx) {
    const height = ctx.canvas.height;
    const image = ctx.createImageData(width, height), bytes = image.data;
    // Byte order independent scanlines, including the shared edges of projected voxels.
    function rect(x, y, w, h, c) {
      const x0 = Math.max(0, Math.round(x)), x1 = Math.min(width, Math.round(x + w));
      const y0 = Math.max(0, Math.round(y)), y1 = Math.min(height, Math.round(y + h));
      for (let j = y0; j < y1; j++) {
        let i = (j * width + x0) * 4;
        for (let k = x0; k < x1; k++, i += 4) {
          bytes[i] = c >> 16; bytes[i+1] = (c >> 8) & 255; bytes[i+2] = c & 255; bytes[i+3] = 255;
        }
      }
    }
    function poly(points, c) {
      const bottom = Math.min(height, Math.ceil(Math.max(...points.map(p => p[1]))));
      for (let y = Math.max(0, Math.floor(Math.min(...points.map(p => p[1])))); y < bottom; y++) {
        const scan = y + 0.5;
        const cuts = [];
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
          const a = points[i], b = points[j];
          if ((a[1] > scan) !== (b[1] > scan)) cuts.push(a[0] + (scan-a[1])*(b[0]-a[0])/(b[1]-a[1]));
        }
        cuts.sort((a,b) => a-b);
        for (let i = 0; i+1 < cuts.length; i += 2) {
          const l = Math.floor(cuts[i]+0.5), r = Math.floor(cuts[i+1]+0.5);
          rect(l, y, r-l, 1, c);
        }
      }
    }
    function oval(x,y,rx,ry,c) {
      for (let dy = -ry; dy <= ry; dy++) {
        const half = Math.round(rx * Math.sqrt(Math.max(0,1-(dy*dy)/(ry*ry))));
        rect(x-half,y+dy,2*half,1,c);
      }
    }
    return { rect, poly, oval, flush: () => ctx.putImageData(image,0,0) };
  }
  function prism(r,x,y,a,b,h,top,left,right) {
    // Two independent ground axes. (x,y) is the camera-facing bottom corner.
    const t = y-h;
    r.poly([[x-a,y-a/2],[x,y],[x,t],[x-a,t-a/2]],left);
    r.poly([[x,y],[x+b,y-b/2],[x+b,t-b/2],[x,t]],right);
    r.poly([[x,t],[x-a,t-a/2],[x-a+b,t-(a+b)/2],[x+b,t-b/2]],top);
  }
  function sky(r, p, id, offset) {
    for (let y=Math.floor(-offset); y<90; y++) {
      const level = Math.max(0, Math.min(1, (y+offset)/(79+offset)));
      r.rect(0,y,width,1,mix(p[0],p[1],level * (2-level)*.91));
    }
    if (id !== 7) {
      const sun = mix(0xffefbb,p[1],.3);
      r.oval(266,20,10,10,sun);
      r.rect(258,26,22,1,mix(p[0],p[1],.64));
      const cloud = (x,y,k) => {
        const c = mix(p[1],0xfff1c9,.56);
        [[0,4,36,3],[7,1,20,5],[12,0,10,3],[30,5,16,2],[-9,6,52,1],[49,6,10,1],[55,4,3,1]].forEach(
          ([a,b,w,h])=>r.rect(x+a*k,y+b*k,w*k,h*k,c));
      };
      cloud(48,18,.9); cloud(170,12,.65); cloud(302,30,.7); cloud(217,34,.45);
    } else {
      for (let i=0;i<8;i++) r.poly([[i*61,-8],[i*61+7,-8],[i*61-20,66],[i*61-30,66]],mix(p[0],p[1],.38));
    }
    for (let layer=0; layer<2; layer++) {
      const rand=rng(id*73+layer*111);
      let x=-14;
      while(x<410) {
        const w=28+rand()*65, h=10+rand()*22, y=layer?71:59;
        const c=mix(p[2],p[1],layer?.16:.48), dark=mix(c,p[0],.17);
        const k=x+w*(.35+rand()*.25);
        r.poly([[x-10,y],[x+w*.18,y-h*.45],[k-5,y-h],[k+4,y-h],[x+w*.75,y-h*.4],[x+w+7,y]],c);
        r.poly([[k+2,y-h],[k+4,y-h],[x+w+7,y],[k+9,y],[k-1,y-h*.52],[k+5,y-h*.52]],dark);
        x+=w*.73;
      }
    }
  }
  const mossDark=0x284c3f, bark=0x695543, cream=0xffe1a1;
  function stream(y) {
    const t=y-68;
    return { center:304+.67*t+12*Math.sin(t*.055), half:3+t*.11+2*Math.sin(t*.11) };
  }
  function terrain(r,p,id) {
    const rand=rng(191+id), tan=p[4], shade=p[5];
    // Fields of sediment, rather than a repeating tile texture.
    const earth=[-.12,-.07,0,.055,.1].map(v=>mix(tan,v<0?shade:cream,Math.abs(v)*1.5));
    for(let y=60; y<height; y++) {
      r.rect(0,y,width,1,tan);
      for(let x=0; x<width; x+=2) {
        const dune = Math.sin(x*.036+y*.068)*.35 + Math.sin(x*.011-y*.12)*.42 + Math.sin(x*.073-y*.052)*.12;
        const band=Math.max(0,Math.min(4,Math.round(1.9+dune*2 + hash(x>>3,y>>2)*.21)));
        r.rect(x,y,2,1,earth[band]);
      }
    }
    for (let i=0;i<960;i++) {
      const x=rand()*width, y=63+rand()*165, w=1+rand()*2.4, v=rand();
      r.rect(x,y,w,1,v<.5?mix(tan,shade,.32):mix(tan,cream,.44));
      if(v>.91)r.rect(x+1,y-1,w-1,1,mix(tan,cream,.58));
    }
    // A spring running out of the right-hand canyon. Reflective pixels follow the shoreline.
    for(let y=68;y<211;y++) {
      const {center:middle,half}=stream(y);
      r.rect(middle-half-4,y,2*half+8,1,mix(tan,shade,.48));
      r.rect(middle-half-2,y,2*half+4,1,mix(tan,cream,.51));
      r.rect(middle-half,y,2*half,1,mix(p[8],p[2],.13));
      r.rect(middle-half+1,y,Math.min(3,half),1,mix(p[8],p[6],.3));
      if(y%4===1)r.rect(middle-half*.48+Math.sin(y)*2,y,half*.75,1,mix(p[8],p[1],.5));
    }
    // Thin layers flake apart along the near ledge, exposing the warmer stone below.
    const sediment=(x,y) => Math.floor(4*Math.sin(x*.041+y*.012)+3*Math.sin(x*.088));
    for(const lip of [209,222]) {
      for(let x=-1; x<width; x+=2) {
        const edge = lip+sediment(x,lip), strength=Math.sin(x*.024+lip)*.6+Math.cos(x*.062)*.4;
        if(strength>-.2) {
          const h=1+Math.floor((strength+.2)*2.9);
          r.rect(x,edge,2,1,mix(tan,cream,.62));
          r.rect(x,edge+1,2,h,mix(tan,shade,.36+strength*.17));
          if(h>3)r.rect(x,edge+h+1,2,1,mix(tan,shade,.26));
        }
      }
    }
    // Fine, wind-combed ripples gather in sheltered pockets of the clearing.
    for(let i=0;i<24;i++) {
      const cx=35+rand()*330,cy=100+rand()*102, n=2+Math.floor(rand()*3);
      for(let k=0;k<n;k++) {
        const w=Math.floor(5+rand()*8);
        const x=cx+k*1.5,y=cy+k*2;
        r.rect(x,y,w,1,mix(tan,shade,.21)); r.rect(x+w,y-1,w*.55,1,mix(tan,shade,.19));
      }
    }
    // Dappled shadows cast by objects outside the camera frame.
    const dapple=mix(tan,shade,.44);
    for(let i=0;i<85;i++) {
      const onLeft=i<44, x=onLeft?rand()*53:377+rand()*60, y=99+rand()*123;
      if ((onLeft?x:410-x) < 16+17*Math.sin(y*.092)) {
        r.poly([[x,y],[x+8,y-3],[x+21,y-2],[x+12,y+2]],dapple);
      }
    }
  }
  function canyon(r,p,id) {
    // Three-dimensional formations sampled on an isometric voxel lattice. The bridge
    // has a missing middle volume, so the opening actually reveals the sky and far bank.
    const pitch=3, arch=id===1||id===4||id===10;
    const tones=[p[3],mix(p[3],p[4],.23),mix(p[3],0x844e45,.24),mix(p[3],p[1],.19)];
    const left=tones.map(c=>mix(c,p[5],.25));
    const right=tones.map(c=>mix(c,0x58484b,.45));
    const cap=mix(p[3],p[4],.65), high=mix(p[4],p[1],.39);
    for(let row=0;row<31;row++) {
      const y=57+row*1.5;
      for(let col=-2;col<width/6+2;col++) {
        const x=col*6+(row%2)*3;
        const massif = (cx,cy,rx,ry) => Math.max(0, 1-Math.pow((x-cx)/rx, 4)-Math.pow((y-cy)/ry,2));
        let h = 0;
        const base=massif(84,68,91,13)+.12*Math.sin(x*.15);
        if (base>.14) h=Math.floor(base*3)*3+3;
        const detached=massif(215,67,43,10);
        if(detached>.26) h=Math.max(h,Math.ceil(detached*2)*4);
        const rightBank=massif(359,77,59,20);
        if(rightBank>.18) h=Math.max(h,Math.ceil(rightBank*3)*4);
        const wing=massif(17,83,38,18);
        if(wing>.09) h=Math.max(h,Math.ceil(wing*3.5)*4);
        let top=0,bottom=0;
        if(arch) {
          const u=(x-106)/49, v=(y-69)/10;
          const ridge=1-Math.pow(u,4)-v*v;
          if(ridge>.03) {
            top=29+Math.floor(Math.min(1,ridge)*4)*3+Math.round(1.5*Math.sin(x*.23));
            if (Math.abs(u)<.55) bottom=12+Math.round(10*(1-(u/.55)**2));
            if (Math.abs(u)>.77) top-=Math.floor((Math.abs(u)-.77)*42);
          }
        }
        const spine=massif(266,70,20,9);
        if(spine>.17)h=Math.max(h,12+Math.floor(spine*3)*4);
        if(h>0||top>0) {
          const layers=(low,hi,capColor) => {
            let z=low;
            while(z<hi) {
              const next=Math.min(hi,Math.floor(z/5)*5+5);
              const index=(Math.floor(z/5)+Math.floor(hash(col,row)*1.06))%4;
              const capTone=hash(col,row)> .69 ? mix(capColor,high,.22) : capColor;
              prism(r,x,y-z,pitch,pitch,next-z,capTone,left[index],right[index]);
              z=next;
            }
          };
          layers(0,h,cap);
          if(top>h) layers(Math.max(h,bottom),top,high);
        }
      }
    }
  }
  function rock(r,p,x,y,s,seed) {
    const rand=rng(seed), top=mix(p[4],p[1],.35), left=mix(p[3],p[4],.45), right=mix(p[3],p[5],.54);
    r.poly([[x-s,y],[x+s*.5,y-s*.2],[x+s*1.6,y+s*.18],[x+s*.6,y+s*.38],[x-s*.6,y+s*.22]],mix(p[4],p[5],.62));
    prism(r,x,y,s*.94,s*.82,s*.25,top,left,right);
    prism(r,x-s*.21,y-s*.31,s*.57,s*.85,s*.25,mix(top,p[1],.2),left,right);
    prism(r,x+s*.17,y-s*.47,s*.44,s*.32,s*.13,top,left,right);
    for(let i=0;i<4;i++) r.rect(x-s*.4+rand()*s*.69,y-s*.72+rand()*s*.19,1+rand()*2,1,mix(left,top,.56));
  }
  function leaves(r,p,x,y,a,b,h,tone) {
    const top=mix(p[7],p[1],tone*.22);
    const side=mix(p[6],p[7],.31+tone*.21), dark=mix(p[6],mossDark,.24);
    prism(r,x,y,a,b,h,top,side,dark);
    const highlights=mix(top,p[1],.32);
    for(let i=1;i<Math.floor((a+b)/2);i+=2) {
      const k=hash(x+i,y);
      if(k>.48)r.rect(x-a*.7+i*.7,y-h-a*.33-i*.08,2,1,highlights);
    }
  }
  function tree(r,p,x,y,size,seed) {
    const rand=rng(seed), trunk=mix(bark,p[3],.24);
    r.poly([[x-8*size,y-4*size],[x+9*size,y-6*size],[x+39*size,y+2*size],[x+28*size,y+6*size]],mix(p[4],p[5],.73));
    const box=(xx,yy,a,b,h) => prism(r,x+xx*size,y+yy*size,a*size,b*size,h*size,mix(trunk,cream,.27),trunk,mix(trunk,mossDark,.4));
    box(0,0,5,4,19); box(1,-18,5,3,9); box(-3,-16,8,3,4);
    box(-9,-22,4,3,12); box(7,-23,3,9,4); box(13,-26,3,3,6);
    box(0,-24,3,3,14);
    // Lobes are separate crowns with twig-sized variations along their lit edges.
    [[-2,-39,11,14,5],[-12,-32,11,12,5],[11,-31,13,10,5],[1,-34,13,10,7],[-6,-39,8,8,3]].forEach(([a,b,w,d,h])=>{
      leaves(r,p,x+a*size,y+b*size,w*size,d*size,h*size,rand());
    });
    for(let i=0;i<8;i++) {
      const dx=(rand()-.5)*35*size,dy=(-31-rand()*6)*size;
      leaves(r,p,x+dx,y+dy,(2+rand()*2)*size,2*size,3*size,rand());
    }
  }
  function plant(r,p,x,y,s,seed,flower=false) {
    const rand=rng(seed);
    for(let i=0;i<9;i++) {
      const dx=(i-4)*1.8*s, tipY=y-(3+rand()*6+(4-Math.abs(i-4))*.8)*s;
      const a=[x,y],b=[x+dx*.74,y-3*s],c=[x+dx,tipY],d=[x+dx*.3,y-2*s];
      r.poly([a,b,c,d], i%2 ? p[6] : mix(p[6],p[7],.54));
      if(i%3===0)r.rect(c[0],c[1],Math.max(1,s),2*s,flower?mix(0xe8a16e,p[1],.18):p[7]);
    }
  }
  function palm(r,p,x,y,s,seed) {
    const rand=rng(seed), wood=mix(p[3],bark,.55);
    const left=mix(wood,p[1],.24), shade=mix(wood,p[6],.24);
    r.poly([[x-6*s,y],[x+6*s,y-2*s],[x+47*s,y+6*s],[x+38*s,y+8*s]],mix(p[4],p[5],.59));
    let xx=x,yy=y;
    for(let i=0;i<13;i++) {
      const w=(3.2-i*.085)*s;
      prism(r,xx,yy,w,w,3.8*s,left,wood,shade);
      r.rect(xx-w*.55,yy-2*s,w,Math.max(1,s),mix(left,p[1],.28));
      xx+=Math.sin((i+3)*.29)*.6*s; yy-=3.5*s;
    }
    const shadow=mix(p[6],0x183f3a,.34), medium=mix(p[6],p[7],.48), sun=mix(p[7],p[1],.26);
    const fronds=[[-26,-11],[-29,3],[-19,12],[-7,17],[3,-14],[18,-12],[30,-4],[25,8],[11,16],[-13,-15]];
    for(let j=0;j<fronds.length;j++){
      const [dx,dy]=fronds[j];
      let lastX=xx,lastY=yy;
      const flip=dx<0?-1:1;
      for(let k=1;k<=9;k++) {
        const t=k/9, fx=xx+dx*s*t,fy=yy+(dy*t-Math.sin(Math.PI*t)*10)*s;
        r.poly([[lastX,lastY],[fx,fy],[fx,fy+1.7*s],[lastX,lastY+2.1*s]],j%3?medium:shadow);
        if(k>1) {
          const len=(2.5+5*Math.sin(t*Math.PI))*s;
          r.poly([[fx,fy],[fx-flip*2*s,fy+.4*s],[fx-flip*1.4*s,fy+len],[fx+flip*s,fy+len-2*s]],j%3===1?medium:shadow);
          r.rect(fx,fy,Math.max(1,s*2),Math.max(1,s*.8),j%3?sun:p[7]);
        }
        lastX=fx;lastY=fy;
      }
    }
    for(let j=0;j<8;j++)r.rect(xx+rand()*6*s-3*s,yy+rand()*5*s,2*s,2*s,mix(wood,p[3],.74));
  }
  function cactus(r,p,x,y,s,seed) {
    const rand=rng(seed), base=mix(p[6],p[7],.38), light=mix(p[7],p[1],.25);
    const pads=(xx,yy,a,h) => {
      const w=a*s; xx=x+xx*s; yy=y+yy*s;
      prism(r,xx,yy,w,w*.65,h*s,light,base,p[6]);
      for(let i=0;i<a;i++) r.rect(xx-rand()*w,yy-rand()*h*s,1,1,light);
    };
    pads(0,0,3.3,8); pads(-2,-5,4.2,6); pads(2.7,-6,3.3,6);
    pads(-4,-10,2.9,5); pads(0,-11,2.9,4);
    r.rect(x-5*s,y-16*s,2*s,2*s,0xd49468);
  }
  function mesaHorizon(r,p) {
    const rand=rng(92);
    for(const [x,w,h] of [[11,19,19],[40,18,12],[75,13,13],[139,25,18],[169,9,29],[195,15,25],[219,20,13],[291,12,16],[331,24,21],[358,9,12]]) {
      const y=64+rand()*3,c=mix(p[3],p[2],.52), flank=mix(c,p[2],.39);
      r.poly([[x-w,y],[x-w,y-3],[x-w*.7,y-7],[x-w*.62,y-11],
        [x-w*.44,y-11],[x-w*.38,y-h],[x+w*.28,y-h],[x+w*.36,y-h+4],
        [x+w*.32,y-9],[x+w*.72,y-6],[x+w,y]],c);
      r.poly([[x+w*.1,y-h],[x+w*.28,y-h],[x+w*.36,y-h+4],[x+w*.32,y-9],[x+w*.72,y-6],[x+w,y],[x+w*.18,y]],flank);
      r.rect(x-w*.35,y-h,w*.49,1,mix(c,p[1],.18));
    }
  }
  function landmarks(r,p,id) {
    const rand=rng(id*1123);
    const base=mix(p[3],p[5],.42), light=mix(base,p[1],.48), dark=mix(base,0x34444c,.4);
    if(id===1) mesaHorizon(r,p);
    if([2,7,9].includes(id)) {
      for(let i=0;i<25;i++) {
        const x=i*16+rand()*8, y=61+rand()*7, s=3+rand()*6, h=8+rand()*35;
        prism(r,x,y,s,s*1.3,h,light,base,dark);
        prism(r,x,y-h,s*.6,s*.7,3,light,base,dark);
        for(let k=3;k<h-2;k+=4) {
          r.rect(x+2,y-k-2,Math.max(1,s*.32),1,mix(p[8],p[1],.6));
          if(id===2)r.rect(x-3,y-k-3,2,1,mix(0xe5a6a0,base,.25));
        }
      }
    } else if(id===5) {
      r.poly([[116,67],[175,34],[194,22],[209,22],[223,35],[281,67]],base);
      r.poly([[194,22],[205,25],[215,43],[225,53],[247,67],[270,67],[218,31],[209,22]],dark);
      r.poly([[195,23],[205,24],[201,32],[213,39],[212,46],[224,54],[220,53],[208,46],[209,41],[197,34]],0xe39666);
    } else if(id===4||id===10||id===8) {
      for(const x of (id===8?[184]:[177,193,217,232])) {
        const h=id===8?32:12+rand()*8;
        prism(r,x,63,5,5,h,light,base,dark);
        prism(r,x,63-h,6,6,2,light,base,dark);
      }
    } else if(id===3||id===6) {
      for(let i=0;i<23;i++) tree(r,p,i*20,62+rand()*9,.4+rand()*.4,i+39);
    }
  }
  function paint(ctx,stage) {
    const id=Number(stage && stage.id)||1;
    const p=(palettes[id-1]||palettes[0]).map(color), target=raster(ctx);
    // Spread the floor in depth and translate each piece of scenery by its
    // ground contact. Its original pixel pitch and silhouette stay intact.
    const depth=ctx.canvas.height/height;
    let sy=1, offset=0;
    const r={
      rect(x,y,w,h,c) { target.rect(x,y*sy+offset,w,h*sy,c); },
      poly(points,c) { target.poly(points.map(([x,y])=>[x,y*sy+offset]),c); },
      oval(x,y,rx,ry,c) { target.oval(x,y*sy+offset,rx,ry,c); },
    };
    target.rect(0,0,width,ctx.canvas.height,p[0]);
    offset=(depth-1)*62;
    sky(r,p,id,offset);
    offset=0; sy=depth;
    terrain(r,p,id);
    sy=1; offset=(depth-1)*62;
    landmarks(r,p,id); canyon(r,p,id);
    const rand=rng(123+id), props=[];
    // Depth-sort scenery by its contact point, just as with the roaming creatures.
    function add(y,draw) { props.push({y,draw}); }
    [[8,85,1.06],[-5,103,.77],[38,81,.57],[336,83,.64],[371,100,1.14],[393,108,.74],
      [270,82,.42],[151,81,.27]].forEach(([x,y,s],i)=>add(y,()=>tree(r,p,x,y,s,i+2)));
    if(id===1||id===4||id===6||id===10) {
      [[11,112,1.72],[362,97,1.09],[29,99,.77],[390,106,.9]].forEach(([x,y,s],i)=>add(y,()=>palm(r,p,x,y,s,25+i)));
    }
    if(id===1||id===5||id===10) {
      [[24,120,.72],[41,91,.46],[384,142,1.1],[9,191,1.2],[352,206,.75],[363,213,.53],[101,87,.35]].forEach(
        ([x,y,s],i)=>add(y,()=>cactus(r,p,x,y,s,i+29)));
    }
    for(let i=0;i<68;i++) {
      const y=75+rand()*153, side=rand()>.5, edge=rand()**2;
      const x=side?403-edge*44:-4+edge*45;
      const s=.5+rand()*.89;
      add(y,()=>plant(r,p,x,y,s,i*7,i%9===0));
    }
    for(let i=0;i<110;i++) {
      const x=rand()*width, y=78+rand()*146, s=1+rand()*2.5;
      if(y>93 && x>37 && x<361 && rand()>.33)continue;
      add(y,()=>rock(r,p,x,y,s,i*13));
    }
    [[94,132,9],[232,116,11],[314,173,14],[-1,181,17],[5,121,14],[356,115,10],[373,174,9],
      [42,213,14],[385,212,22],[9,226,20],[287,221,9]].forEach(([x,y,s],i)=>{
      add(y,()=>rock(r,p,x,y,s,109+i));
      add(y+.6,()=>{ plant(r,p,x+s*.67,y+2,s*.065,50+i,i%3===0); });
    });
    for (const prop of props.sort((a,b)=>a.y-b.y)) {
      offset=(depth-1)*prop.y;
      prop.draw();
    }
    target.flush();
  }
  function animate(ctx,stage,t) {
    // Short ripples drift down the visible river. The same cross-section paints the
    // permanent bed and bounds the moving highlights, so they follow its two bends.
    const depth=ctx.canvas.height/height;
    ctx.fillStyle=stage.id===5 ? "#eaa16e" : "#9ec7b5";
    for(let i=0;i<8;i++){
      const age=(t*.18+i*.367)%1;
      if(age>.63)continue;
      const y=Math.floor(98+(i*17)%89+age*8);
      const {center,half}=stream(y);
      const x=Math.round(center+half*Math.sin(i*5.32)*.55);
      ctx.fillRect(x,Math.round(y*depth),1+Math.round(Math.sin(age/.63*Math.PI)*3),1);
    }
    if(stage.id===7 || stage.id===9)return;
    // A little flock periodically crosses the horizon far behind the animals.
    const passage=(t+7)%51;
    if(passage>10)return;
    ctx.fillStyle="rgba(68,89,79,.71)";
    for(let i=0;i<3;i++){
      const x=Math.round(128+passage*9-i*5);
      const y=Math.round(18+(depth-1)*62+i*2+Math.sin(t*.8+i)*1.4);
      const wing=Math.floor(t*3+i)%2 ? -1 : 0;
      ctx.fillRect(x-1,y+wing,1,1);ctx.fillRect(x,y,1,1);ctx.fillRect(x+1,y+wing,1,1);
    }
  }
  return { paint, animate, perches };
})();
