"use strict";

// Native pixel canvas for the live cabinet. The felt and wireforms are stamped once.
// Dynamic hardware is projected directly from the same coordinates as the contacts.
const TableArt = {
  gecko: null,
  polygon(ctx, points, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.fill();
  },
  stroke(ctx, points, color, width) {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath();
    points.forEach(({ x, y }, i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.stroke();
  },
  disk(ctx, x, y, r, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  },
  rim(ctx, x, y, r, color, width) {
    ctx.lineWidth = width; ctx.strokeStyle = color;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  },
  notch(ctx, x, y, w, h, fill) {
    const k = Math.min(4, Math.floor(w / 3), Math.floor(h / 3));
    this.polygon(ctx, [[x+k,y],[x+w-k,y],[x+w,y+k],[x+w,y+h-k],
      [x+w-k,y+h],[x+k,y+h],[x,y+h-k],[x,y+k]], fill);
  },
  wire(ctx, track, launch) {
    const pts = track.points;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.translate(1, 3);
    this.stroke(ctx, pts, '#152c2a', launch ? 10 : 8);
    ctx.translate(-1, -3);
    this.stroke(ctx, pts, '#715b38', launch ? 10 : 7);
    this.stroke(ctx, pts, '#cfb67c', launch ? 8 : 5.6);
    this.stroke(ctx, pts, launch ? '#153934' : '#28534a', launch ? 6 : 3.5);
    for (let i = 3; i < pts.length - 1; i += 5) {
      const a = pts[i], b = pts[i+1];
      const angle = Math.atan2(b.y-a.y,b.x-a.x);
      const dx = Math.sin(angle) * 4.5, dy = -Math.cos(angle) * 4.5;
      for (const sign of [-1, 1]) {
        ctx.fillStyle = '#e0c999';
        ctx.fillRect(Math.round(a.x + sign*dx),Math.round(a.y + sign*dy),1,2);
      }
    }
    ctx.restore();
  },
  peg(ctx, n) {
    const x = Math.round(n.x), y = Math.round(n.y);
    ctx.fillStyle = '#183c36'; ctx.fillRect(x, y, 3, 4);
    ctx.fillStyle = '#524630'; ctx.fillRect(x-1,y,3,2);
    ctx.fillStyle = '#a88452'; ctx.fillRect(x-1,y-1,3,2);
    ctx.fillStyle = '#f1d69b'; ctx.fillRect(x-1,y-1,2,1);
  },
  screw(ctx,x,y) {
    this.disk(ctx,x,y+1,2.4,'#21312a');
    this.disk(ctx,x,y,2.1,'#bb9b68');
    ctx.fillStyle = '#5b543e'; ctx.fillRect(x-1,y,3,1);
  },
  makeBase() {
    const t = CRANK_TABLE;
    const base = document.createElement('canvas');
    base.width = t.w; base.height = t.h;
    const c = base.getContext('2d');
    c.fillStyle = '#152b29'; c.fillRect(0,0,t.w,t.h);
    this.notch(c,0,0,208,205,'#4e5141');
    this.notch(c,1,1,206,202,'#b39869');
    this.notch(c,3,3,202,198,'#3a3c30');
    this.notch(c,4,4,200,195,'#246055');
    this.notch(c,7,6,194,188,'#327161');
    // Woven cloth, turning to shade beside the return trough and below the wire rails.
    const g = c.createLinearGradient(0,0,157,194);
    g.addColorStop(0,'#376e5d'); g.addColorStop(0.52,'#2c6657'); g.addColorStop(1,'#1e4b43');
    this.notch(c,8,7,192,186,g);
    for (let y=8;y<189;y+=3) {
      for (let x=8+(y%4);x<200;x+=5) {
        const n=(x*19+y*23)%13;
        c.fillStyle = n<4 ? '#ffffff08' : '#092c2112';
        c.fillRect(x,y,n%3===0?2:1,1);
      }
    }
    // Fine inlaid fans follow the curvature of the top arch of the launch ramp.
    for (let k=0;k<3;k++){
      c.beginPath(); c.moveTo(25+k*3,139); c.lineTo(25+k*3,73);
      c.quadraticCurveTo(25+k*3,18+k*3,81,18+k*3);
      c.lineTo(174,18+k*3);
      c.strokeStyle = k===1 ? '#a4a87858' : '#1e4d42'; c.lineWidth=1; c.stroke();
    }
    // The brass escutcheon carries a small model-derived gecko engraving.
    this.notch(c,146,26,44,20,'#1d4e43');
    this.notch(c,147,26,42,19,'#54795c');
    this.notch(c,148,27,40,17,'#2c594a');
    for (const y of [29,42]) {
      c.fillStyle='#b19c63'; c.fillRect(150,y,1,1); c.fillRect(185,y,1,1);
    }
    // Lower relief under the moving controls and from the outer pin fields.
    const wheel = t.wheel;
    this.disk(c,wheel.x+1,wheel.y+3,28,'#12372f');
    this.disk(c,wheel.x,wheel.y,28,'#90764e');
    this.rim(c,wheel.x,wheel.y,26.4,'#dcc390',1.8);
    this.disk(c,wheel.x,wheel.y,25,'#605138');
    this.rim(c,wheel.x,wheel.y,24,'#a58956',1);
    // Stamped brass endplates carry the throat of each wireform.
    for (const part of t.tracks) {
      this.wire(c,part.track,false);
      this.polygon(c,[[part.x-part.half-2,part.y-3],[part.x-3,part.y+3],[part.x-4,part.y+6],
        [part.x-part.half-2,part.y+1]],'#a88956');
      this.polygon(c,[[part.x+part.half+2,part.y-3],[part.x+3,part.y+3],[part.x+4,part.y+6],
        [part.x+part.half+2,part.y+1]],'#b8a16c');
      c.fillStyle='#e4c889'; c.fillRect(part.x-part.half-2,part.y-3,3,1); c.fillRect(part.x+part.half-1,part.y-3,3,1);
    }
    this.wire(c,t.launch,true);
    this.notch(c,4,173,13,16,'#736247');
    this.notch(c,5,173,11,10,'#cfac73');
    this.notch(c,6,174,9,7,'#25463b');
    for(let x=7;x<14;x+=3) {
      c.fillStyle='#789484';c.fillRect(x,176,1,3);
    }
    for(const n of t.nails) this.peg(c,n);
    this.notch(c,84,129,49,16,'#225648');
    this.notch(c,86,130,45,14,'#57795c');
    this.notch(c,87,131,43,12,'#315d4b');
    for(let x=92;x<=126;x+=34) this.screw(c,x,137);
    // Blackened brass trough. Only the three marked cups are open prizes.
    this.notch(c,20,181,178,16,'#514b36');
    this.notch(c,21,182,176,13,'#151f1c');
    for(let x=24;x<196;x+=4) {
      c.fillStyle='#405248';c.fillRect(x,184,2,6);
      c.fillStyle='#6c755e';c.fillRect(x,184,1,2);
    }
    for(const p of t.pockets) {
      const half = p.half;
      this.polygon(c,[[p.x-half-2,179],[p.x-half+1,186],[p.x+half-1,186],[p.x+half+2,179],
        [p.x+half+1,193],[p.x-half-1,193]],'#d0ad71');
      this.polygon(c,[[p.x-half,181],[p.x-half+1,185],[p.x+half-1,185],[p.x+half,181],
        [p.x+half-1,191],[p.x-half+1,191]],p.tier==='rare'?'#943e36':'#386a53');
      if(p.tier==='rare') {
        this.polygon(c,[[p.x,183],[p.x+3,187],[p.x,190],[p.x-3,187]],'#ffdaa0');
        c.fillStyle='#fff2c4';c.fillRect(p.x-1,185,2,2);
      } else {
        this.polygon(c,[[p.x,184],[p.x+2,186],[p.x+2,188],[p.x+1,189],[p.x-2,189],[p.x-3,187],[p.x-2,185]],'#e0d0a0');
        c.fillStyle='#fbefc0';c.fillRect(p.x-1,185,1,2);
      }
    }
    for (const [x,y] of [[5,5],[202,5],[5,198],[202,198]]) this.screw(c,x,y);
    return base;
  },
  rotor(c, angle) {
    const w=CRANK_TABLE.wheel, x=w.x, y=w.y;
    // A low-relief European roulette bowl beneath the brass star wheel.
    for(let i=0;i<18;i++) {
      const a=angle+i*Math.PI/9, b=a+Math.PI/9;
      const col=i===0?'#3a8665':i%2?'#a85648':'#283e39';
      const inner=14, outer=23;
      this.polygon(c,[[x+inner*Math.cos(a),y+inner*Math.sin(a)],[x+outer*Math.cos(a),y+outer*Math.sin(a)],
        [x+outer*Math.cos(b),y+outer*Math.sin(b)],[x+inner*Math.cos(b),y+inner*Math.sin(b)]],col);
      const mid=a+Math.PI/18;
      c.fillStyle='#d3c39a';c.fillRect(Math.round(x+19.8*Math.cos(mid)),Math.round(y+19.8*Math.sin(mid)),1,1);
    }
    this.disk(c,x,y,14.2,'#bf9d66');
    this.disk(c,x,y,12.4,'#70583b');
    this.disk(c,x,y-1,10.2,'#a18452');
    for(let i=0;i<w.arms;i++) {
      const a=angle+i*Math.PI*2/w.arms;
      const ex=x+Math.cos(a)*w.radius, ey=y+Math.sin(a)*w.radius;
      this.stroke(c,[{x,y:y+1.6},{x:ex,y:ey+1.6}],'#463d2c',3.2);
      this.stroke(c,[{x,y},{x:ex,y:ey}],'#d4b77c',2.4);
      this.disk(c,ex,ey,1.65,'#f0d49b');
    }
    this.disk(c,x,y,5.4,'#5a513a');
    this.disk(c,x,y-1,4.3,'#d2b580');
    this.disk(c,x-1,y-2,2,'#f1dcaa');
  },
  gate(c, board) {
    const gate=CRANK_TABLE.gate, cos=Math.cos(board.gateAngle),sin=Math.sin(board.gateAngle);
    const ax=gate.x-cos*gate.length,ay=gate.y-sin*gate.length;
    const bx=gate.x+cos*gate.length,by=gate.y+sin*gate.length;
    this.stroke(c,[{x:ax,y:ay+2},{x:bx,y:by+2}],'#213931',5);
    this.stroke(c,[{x:ax,y:ay},{x:bx,y:by}],'#a68651',4.5);
    this.stroke(c,[{x:ax,y:ay-1},{x:bx,y:by-1}],'#e2c88c',1.5);
    this.disk(c,gate.x,gate.y,3.9,'#5b553b');
    this.disk(c,gate.x,gate.y-1,2.4,'#d3c397');
    const sign=board.gateDirection, x=gate.x+sign*11, y=149;
    this.polygon(c,[[x-sign*3,y-2],[x+sign*2,y],[x-sign*3,y+2]],'#dcc184');
  },
  paint(ctx,w,h,board,effects) {
    if(!effects.base) {
      effects.base=this.makeBase();
      effects.surface=document.createElement('canvas');
      effects.surface.width=CRANK_TABLE.w; effects.surface.height=CRANK_TABLE.h;
      effects.pixel=effects.surface.getContext('2d');
      effects.pixel.imageSmoothingEnabled=false;
      if(!this.gecko) { this.gecko=new Image(); this.gecko.src=INK_RELIEFS.gecko; }
    }
    const c=effects.pixel, t=CRANK_TABLE;
    c.drawImage(effects.base,0,0);
    if(this.gecko.complete && this.gecko.naturalWidth) {
      c.drawImage(this.gecko,0,10,92,37,151,29,34,14);
    }
    this.rotor(c,board.wheelAngle);
    this.gate(c,board);
    if(board.canAcceptEgg && !board.canAcceptEgg()) {
      for(const p of t.pockets.filter((p)=>p.tier==='egg')) {
        this.notch(c,p.x-p.half,180,p.half*2,5,'#626b5b');
        c.fillStyle='#9fa18a';c.fillRect(p.x-p.half+2,181,p.half*2-4,1);
      }
    }
    for(const ball of board.balls) {
      const x=Math.round(ball.x), y=Math.round(ball.y);
      const alpha=ball.phase==='miss' ? Math.max(0,1-(y-t.landY)/14) : 1;
      c.globalAlpha=alpha;
      this.disk(c,x+1,y+2,3.25,'#16372f');
      this.notch(c,x-3,y-3,6,6,'#aab9ac');
      c.fillStyle='#e7eee0'; c.fillRect(x-2,y-2,3,2);
      c.fillStyle='#fffde7'; c.fillRect(x-1,y-2,2,1);
      c.fillStyle='#607e73'; c.fillRect(x,y+1,2,1);
    }
    c.globalAlpha=1;
    board.drainEvents();
    ctx.imageSmoothingEnabled=false;
    ctx.fillStyle='#162e29';ctx.fillRect(0,0,w,h);
    const scale=Math.min(w/t.w,h/t.h);
    const sw=Math.round(t.w*scale),sh=Math.round(t.h*scale);
    ctx.drawImage(effects.surface,Math.floor((w-sw)/2),Math.floor((h-sh)/2),sw,sh);
  },
};
