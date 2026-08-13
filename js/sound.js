// =============================================================
// sound — 発音の単一窓口(docs/SoundSkills.md 憲章・2026-08-11 Ric承認)
//
// 規律(憲章の実装形):
//   ・最重要: 音は情報の唯一の担い手にならない=全ての play() 呼び出しは既存の視覚表示と対で行う
//   ・発音は Sound.play(id) のみ。AudioContext を本ファイル以外に書かない(恒久テストが全数走査=不可逆②)
//   ・パラメータは全て CFG(soundDefs / soundMaster / 間引き閾値…)=コード変更なしで調整できる
//   ・初回無音: 既定OFF。ON状態はセーブ側(Game.soundEnabled=dialの器)が持ち、Sound は setEnabled で
//     知らされるだけ=演出層はセーブのキー名を知らない(holo の gates 注入と同型)
//   ・autoplay policy: AudioContext は初回のユーザー操作(unlock)後にだけ生成する
//   ・合成のみ(WebAudio)。ファイル音源は SoundSkills §6 拡張条項の裁定を経てから(不可逆③)
//   ・決定論: ノイズは固定シードの xorshift(Math.random 不使用)。同一 def=同一波形
//   ・テスト器: renderOffline(id) が実再生と同じ _voice() を OfflineAudioContext に通す=単一の真実。
//     発音ログ(Sound.log)は装置QAが「1操作1音・連打の間引き」を数える観測手段
// =============================================================
const Sound = {
  enabled: false,   // ルール層から setEnabled で注入される(セーブは知らない)
  _ctx: null,
  _unlocked: false,
  _last: {},        // id -> 直近発音時刻ms(間引き)
  _voices: 0,       // 実発音中のボイス数(プール)
  log: [],          // 発音ログ {id,t} 最大64件(テスト器・リングバッファ)

  _now() { return (typeof performance !== "undefined" && performance.now) ? performance.now() : 0; }, // テストで差し替え可

  setEnabled(v) {
    this.enabled = !!v;
    if (this.enabled) this._ensureCtx();
    else this.ambientOff();   // OFFにしたら常時音も止める(切ったのに鳴り続けない)
  },
  on() { return this.enabled; },

  // 初回のユーザー操作で一度だけ呼ばれる(boot が配線)。autoplay policy 対応の唯一の入口
  unlock() { this._unlocked = true; if (this.enabled) this._ensureCtx(); },
  _ensureCtx() {
    if (this._ctx || !this._unlocked || typeof AudioContext === "undefined") return;
    try { this._ctx = new AudioContext(); } catch (e) { this._ctx = null; return; }
    if (this._ctx.state === "suspended") this._ctx.resume();
  },

  // 定義の解決: CFG の既定値(soundDefDefaults)に個別defを重ねた**完全なdef**を返す。
  //   部分指定のdefでも下流が欠損を気にしなくてよい=既定値の知識はCFGの1箇所だけに置く。
  //   ★ここから下、音の数値は一切ハードコードしない(CFG直読)。data.js は sound.js より必ず先に
  //     読まれる硬い依存(index.html / test-hqlab-qa.html / node テストの全経路で保証)。
  //     フォールバック定数を置くと「CFGを直しても効かない第二の既定値」が生まれる=知識の二重化。
  def(id) { const raw = CFG.soundDefs[id]; return raw ? Object.assign({}, CFG.soundDefDefaults, raw) : null; },
  prio(id) { return CFG.soundPriority[id] || 0; },

  // 発音の可否(純ロジック=クロック注入でテスト可能): 同一SEの最小間隔+ボイスプール+優先度の追加枠
  _admit(id, t) {
    if (this._last[id] != null && t - this._last[id] < CFG.soundMinGapMs) return false;
    if (this._voices < CFG.soundMaxVoices) return true;
    // 満杯: 高優先(soundPrioFloor 以上=ボス撃破/石の生成)だけ追加枠を使える
    return this.prio(id) >= CFG.soundPrioFloor && this._voices < CFG.soundMaxVoices + CFG.soundPrioExtra;
  },

  // 単一窓口。戻り値=窓口として発音を受理したか(ログはこの受理を数える)。
  // 呼び出し側の規律: 必ず視覚表示と対で呼ぶ(音にしかない情報を作らない)・1操作1音。
  play(id) {
    if (!this.enabled) return false;
    const d = this.def(id);
    if (!d) return false;
    const t = this._now();
    if (!this._admit(id, t)) return false;
    this._last[id] = t;
    this.log.push({ id: id, t: t });
    if (this.log.length > CFG.soundLogMax) this.log.shift();
    this._ensureCtx();
    if (this._ctx) this._voice(this._ctx, this._ctx.destination, d, this._ctx.currentTime, true);
    return true;
  },

  // 音の尺(層があれば最も長い層)。テスト器のレンダリング尺と、ボイス解放の基準に使う
  _span(d) {
    const L = d.layers && d.layers.length ? d.layers : [d];
    return L.reduce((m, l) => Math.max(m, (l.dur != null ? l.dur : d.dur) + (l.release != null ? l.release : d.release)), 0);
  },

  // 音声グラフの単一実装: 実再生(play)とオフライン検査(renderOffline)が同じ関数を通る=単一の真実。
  //   ★layers: 1つの音idが複数の層を重ねられる(S3の stone=ノイズバースト+ベル)。
  //     層は def を土台に必要な項目だけ上書きする=既存の単層defは layers 無しのまま一切変わらない。
  //     「1操作1音」(§2-7)は保たれる: 発音ログもボイス数も**1音として1つ**しか数えない。
  _voice(ctx, dest, d, when, count) {
    const layers = (d.layers && d.layers.length)
      ? d.layers.map((l) => { const m = Object.assign({}, d, l); delete m.layers; return m; })
      : [d];
    let longest = null, longestSpan = -1;
    for (const l of layers) {
      const n = this._layer(ctx, dest, l, when);
      const sp = l.dur + l.release;
      if (sp > longestSpan) { longestSpan = sp; longest = n; }
    }
    // ボイスの解放は**最後に鳴り終わる層**に紐づける(層の数だけプールを食わない)
    if (count && longest) {
      this._voices++;
      longest.src.onended = () => { this._voices = Math.max(0, this._voices - 1); };
    }
    return longest;
  },

  // 1層ぶんの音声グラフ(従来の _voice の中身。単層defではこれが1回だけ呼ばれる=波形は不変)
  _layer(ctx, dest, d, when) {
    const vol = d.vol * CFG.soundMaster * (d.bus === "amb" ? CFG.soundAmbVol : CFG.soundSeVol);
    const t0 = when, a = d.attack, dur = d.dur, rel = d.release;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + a);
    g.gain.setValueAtTime(vol, t0 + dur);
    g.gain.linearRampToValueAtTime(0, t0 + dur + rel);
    g.connect(dest);
    let src;
    if (d.type === "noise") {
      // 決定論ノイズ: 固定シード xorshift(Math.random 不使用=同一defは同一波形)
      const len = Math.ceil(ctx.sampleRate * (dur + rel));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      let seed = (d.seed >>> 0) || 1;
      for (let i = 0; i < len; i++) { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed ^= seed << 5; seed >>>= 0; ch[i] = (seed / 4294967295) * 2 - 1; }
      src = ctx.createBufferSource(); src.buffer = buf;
      if (d.filterFreq) { const f = ctx.createBiquadFilter(); f.type = d.filterType || "lowpass"; f.frequency.value = d.filterFreq; src.connect(f); f.connect(g); }
      else src.connect(g);
    } else {
      src = ctx.createOscillator();
      src.type = d.type;
      src.frequency.setValueAtTime(d.freq, t0);
      if (d.freqEnd) src.frequency.linearRampToValueAtTime(d.freqEnd, t0 + dur);
      src.connect(g);
    }
    src.start(t0);
    src.stop(t0 + dur + rel + CFG.soundStopPadSec);
    return { src: src, gain: g };
  },

  // =============================================================
  // 環境音(S2・飼育槽)。SEとは設計思想が異なる:
  //   SE   = 一瞬の主張。物差しは peak(尺に依存しない当たりの強さ)。
  //   環境音 = 常時鳴り背景に沈む。物差しは**持続RMS・定常性・低域比率**。peakは意味を持たない。
  //   最優先は「疲れないこと・主張しないこと」。だから息づかいは非常にゆっくり・浅く、
  //   音量はSE最軽(給餌)よりさらに小さく、BGMらしい旋律は置かない。
  // =============================================================

  // 惑星の空色 → 環境音のパラメータ。**色は既に惑星ごとの真実**なので、音のために別表を作らない
  //   (データ駆動=知識を二重に持たない)。色相→パッドの音程 / 明度→風のこもり具合とオクターブ /
  //   彩度→パッドの存在感。調整はここではなくCFGの範囲値で行う=10惑星の関係が崩れない。
  ambientFromTint(hex) {
    const s = String(hex).replace("#", "");
    const r = parseInt(s.slice(0, 2), 16) / 255, g = parseInt(s.slice(2, 4), 16) / 255, b = parseInt(s.slice(4, 6), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let hue = 0;
    if (d > 0) {
      if (mx === r) hue = ((g - b) / d + 6) % 6;
      else if (mx === g) hue = (b - r) / d + 2;
      else hue = (r - g) / d + 4;
      hue *= 60;
    }
    const light = (mx + mn) / 2;
    const den = 1 - Math.abs(2 * light - 1);
    const sat = (d === 0 || den <= 0) ? 0 : d / den;
    const semi = Math.round(hue / 30) % 12;                     // 色相を12音へ
    const oct = (light - 0.5) * CFG.soundAmbPadOctaves;         // 明るい空ほど高い(暗い惑星は低く沈む)
    return {
      padHz: CFG.soundAmbPadBaseHz * Math.pow(2, semi / 12 + oct),
      cutHz: CFG.soundAmbCutMinHz + (CFG.soundAmbCutMaxHz - CFG.soundAmbCutMinHz) * light,
      padMix: CFG.soundAmbPadLevel * (0.5 + sat),
      hue: hue, light: light, sat: sat,                          // 検分ページの表示用(音の判断材料)
    };
  },

  // 場所 → 環境音のパラメータ(S3)。★憲章§3-2の原則をそのまま場所へ広げたもの:
  //   **その場所の性格を既に決めている実データ**から導く。音のために場所の別表を作らない。
  //     飼育槽 = STAGES[].sky        … 惑星ごとの空色(惑星差はここだけが持つ)
  //     本部   = CFG.holoPal.void    … HOLOの虚空色(#04060a=冷たく暗い)
  //     巣     = NEST_VIS.palette.bg0… 巣の背景中心の暖み(#2a1c0c=温かく暗い)
  //   ★同じ写像(ambientFromTint)を3場所で使う=場所ごとに導出器を作らない。色を変えれば音も追随する。
  //   ★本部と巣は**全惑星共通**(HQは単一・nestWebも全惑星共通)なので、惑星による差を持たない。
  //     導出は「差」を作るための道具であり、差の無い場所に惑星差を作らないのが正しい(二重定義の予防)。
  //   質感の差(温かい生命/冷たい計器/籠もった安息)は色ではなく**グラフの構造**が担う(_ambientGraph)。
  ambientForPlace(place, stage) {
    const tint = place === "hq" ? (CFG.holoPal && CFG.holoPal.void)
      : place === "nest" ? (typeof NEST_VIS !== "undefined" && NEST_VIS.palette && NEST_VIS.palette.bg0)
        : (stage && stage.sky);
    if (!tint) return null;
    const p = this.ambientFromTint(tint);
    p.place = place;
    return p;
  },
  // 場所とパラメータの同一性(これが同じなら鳴らし直さない=同じ場所の再通知で音を沈ませない)
  _ambSig(p) { return !p ? "" : p.place + "|" + p.padHz.toFixed(3) + "|" + p.cutHz.toFixed(2) + "|" + p.padMix.toFixed(4); },

  _ambLevel() { return CFG.soundAmbLevel * CFG.soundMaster * CFG.soundAmbVol; },

  // 点の層(本部のtick・巣の心拍)の単一実装: 決定論のループバッファに焼き込む。
  //   ★オシレータ+LFOではなくバッファにするのは、①完全に決定論 ②OfflineAudioContextで
  //     実再生と同一の波形が出る ③周期が「既存の真実」(0.4秒グリッド等)にきっちり乗る、の3点。
  //   pulses = [{at:秒, freq:Hz, dur:秒, amp:0-1}] を period 秒のバッファへ書き、loop で回す。
  _loopPulseBuf(ctx, period, pulses) {
    const sr = ctx.sampleRate, len = Math.max(1, Math.ceil(sr * period));
    const buf = ctx.createBuffer(1, len, sr);
    const ch = buf.getChannelData(0);
    for (const q of pulses) {
      const i0 = Math.floor(sr * q.at), n = Math.max(1, Math.floor(sr * q.dur));
      for (let i = 0; i < n && i0 + i < len; i++) {
        const t = i / sr;
        const env = Math.exp(-t / (q.dur / 4));                 // 打点=急峻に立ち上がり指数で減衰
        ch[i0 + i] += Math.sin(2 * Math.PI * q.freq * t) * env * q.amp;
      }
    }
    return buf;
  },

  // 場所ごとの音声グラフの振り分け。★質感の差(温かい生命/冷たい計器/籠もった安息)はここが担う。
  //   色から来るのは「音程・こもり・存在感」まで。構造まで色から導くことはできない(§3-2の但し書き)。
  _ambientGraph(ctx, dest, p) {
    if (p && p.place === "hq") return this._ambGraphHq(ctx, dest, p);
    if (p && p.place === "nest") return this._ambGraphNest(ctx, dest, p);
    return this._ambGraphTank(ctx, dest, p);
  },

  // 本部: 冷たい計器。低ハム(強フィルタ矩形波)+ 起動シーケンスと同じ 0.4秒グリッドに乗るtick。
  //   ★tickの周期は CFG.holoGridSec の倍数=**HOLOの起動シーケンスと同じ真実**から導く(別表を作らない)。
  //   ★持続層(ハム)と点の層(tick)を分けてある。疲れの物差し(定常性)は持続層で測り、
  //     点の層はSEと同じくpeakで測る=同じ音の中に物差しの違う2種が同居している(§3-2)。
  _ambGraphHq(ctx, dest, p) {
    const out = ctx.createGain();
    out.gain.value = this._ambLevel();
    out.connect(dest);
    // ハム: 矩形波を強いローパスで削る=倍音の骨だけが残る「計器のうなり」
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = p.cutHz;
    const humG = ctx.createGain(); humG.gain.value = CFG.soundHqHumLevel;
    const o1 = ctx.createOscillator(); o1.type = "square"; o1.frequency.value = p.padHz;
    o1.connect(lp); lp.connect(humG); humG.connect(out);
    // 息づかい: 完全に静止した音は疲れる(S2の知見)。周期・深さは飼育槽と同じCFG=知識を1箇所に置く
    const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 1 / CFG.soundAmbBreathSec;
    const lfoG = ctx.createGain(); lfoG.gain.value = p.cutHz * CFG.soundAmbBreathDepth;
    lfo.connect(lfoG); lfoG.connect(lp.frequency);
    // tick: 起動シーケンスのグリッド(0.4秒)の倍数ごとに、可聴限界近くの極小の点
    const period = CFG.holoGridSec * CFG.soundHqTickGrids;
    const tickG = ctx.createGain(); tickG.gain.value = CFG.soundHqTickLevel; tickG.connect(out);
    const tick = ctx.createBufferSource();
    tick.buffer = this._loopPulseBuf(ctx, period, [{ at: 0, freq: CFG.soundHqTickHz, dur: CFG.soundHqTickSec, amp: 1 }]);
    tick.loop = true; tick.connect(tickG);
    o1.start(0); lfo.start(0); tick.start(0);
    return { out: out, lp: lp, o1: o1, srcs: [o1, lfo, tick] };
  },

  // 巣: 籠もった安息。フィードバックディレイのパッド + 心拍様の低い脈。
  //   ★巣は全惑星共通=惑星差を持たない。籠もりはローパスではなく**ディレイの反響**が作る。
  _ambGraphNest(ctx, dest, p) {
    const out = ctx.createGain();
    out.gain.value = this._ambLevel();
    out.connect(dest);
    // パッド: わずかにずらした2声 → フィードバックディレイ → ローパス(反響が回るほど暗くなる)
    const padG = ctx.createGain(); padG.gain.value = p.padMix * CFG.soundNestPadLevel;
    const dly = ctx.createDelay(2.0); dly.delayTime.value = CFG.soundNestDelaySec;
    const fb = ctx.createGain(); fb.gain.value = CFG.soundNestFeedback;   // <1(発散させない)
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = p.cutHz;
    const o1 = ctx.createOscillator(); o1.type = "sine"; o1.frequency.value = p.padHz;
    const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = p.padHz * CFG.soundNestPadDetune;
    o1.connect(padG); o2.connect(padG);
    padG.connect(lp); padG.connect(dly);
    dly.connect(fb); fb.connect(lp); fb.connect(dly);   // 反響が減衰しながら回る
    lp.connect(out);
    // 心拍: 2打(ドッ・ドッ)の低い脈。安息なので非常にゆっくり=息づかいと同じ「速いと主張になる」規律
    const hb = ctx.createGain(); hb.gain.value = CFG.soundNestPulseLevel; hb.connect(out);
    const src = ctx.createBufferSource();
    const f = p.padHz * CFG.soundNestPulseRatio;
    src.buffer = this._loopPulseBuf(ctx, CFG.soundNestPulseSec, [
      { at: 0, freq: f, dur: CFG.soundNestPulseDur, amp: 1 },
      { at: CFG.soundNestPulseGap, freq: f, dur: CFG.soundNestPulseDur, amp: CFG.soundNestPulse2Amp },
    ]);
    src.loop = true; src.connect(hb);
    o1.start(0); o2.start(0); src.start(0);
    return { out: out, lp: lp, o1: o1, o2: o2, padG: padG, srcs: [o1, o2, src] };
  },

  // 飼育槽(S2・Ric承認済み): 風ノイズ+惑星tint連動の微パッド。**波形は一切変更しない**
  _ambGraphTank(ctx, dest, p) {
    const out = ctx.createGain();
    out.gain.value = this._ambLevel();
    out.connect(dest);
    // 風: 決定論ノイズ(固定シードxorshift)のループ → ローパス
    const len = Math.ceil(ctx.sampleRate * CFG.soundAmbNoiseSec);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    let seed = (CFG.soundAmbSeed >>> 0) || 1;
    for (let i = 0; i < len; i++) { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed ^= seed << 5; seed >>>= 0; ch[i] = (seed / 4294967295) * 2 - 1; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = p.cutHz;
    const wind = ctx.createGain(); wind.gain.value = CFG.soundAmbWindLevel;
    src.connect(lp); lp.connect(wind); wind.connect(out);
    // 息づかい: ローパスをごくゆっくり浅く開閉する。静止したノイズは扇風機のように疲れるが、
    //   速い/深い揺らぎは「主張」になる。周期・深さはCFG(★Ric調整)。
    const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 1 / CFG.soundAmbBreathSec;
    const lfoG = ctx.createGain(); lfoG.gain.value = p.cutHz * CFG.soundAmbBreathDepth;
    lfo.connect(lfoG); lfoG.connect(lp.frequency);
    // 微パッド: わずかにずらした2声(うなりでゆっくり揺れる)。旋律は持たない=BGMを置かない
    const padG = ctx.createGain(); padG.gain.value = p.padMix; padG.connect(out);
    const o1 = ctx.createOscillator(); o1.type = "sine"; o1.frequency.value = p.padHz;
    const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = p.padHz * CFG.soundAmbPadDetune;
    o1.connect(padG); o2.connect(padG);
    src.start(0); lfo.start(0); o1.start(0); o2.start(0);
    return { out: out, lp: lp, o1: o1, o2: o2, padG: padG, srcs: [src, lfo, o1, o2] };
  },

  _ambRamp(gainParam, to, sec) {
    const t = this._ctx.currentTime;
    gainParam.cancelScheduledValues(t);
    gainParam.setValueAtTime(gainParam.value, t);
    gainParam.linearRampToValueAtTime(to, t + sec);
  },
  // 惑星の差し替え(同じ場所=同じグラフ構造なので、鳴らしたままパラメータだけ替えられる)
  _ambApply(p) {
    const a = this._amb; if (!a) return;
    if (a.lp) a.lp.frequency.value = p.cutHz;
    if (a.o1) a.o1.frequency.value = p.padHz;
    if (a.o2) a.o2.frequency.value = p.padHz * CFG.soundAmbPadDetune;
    if (a.padG) a.padG.gain.value = p.padMix;
  },
  _ambBuild(p) {
    this._amb = this._ambientGraph(this._ctx, this._ctx.destination, p);
    this._amb.place = p.place;
    this._amb.out.gain.value = 0;
  },
  _ambDispose(a) {
    for (const s of a.srcs) { try { s.stop(); } catch (e) { /* 停止済み */ } }
    try { a.out.disconnect(); } catch (e) { /* 切断済み */ }
  },

  // 環境音の開始/切替。★「いったん無音まで下げてから差し替えて戻す」=
  //   周波数を鳴らしたまま動かすとポルタメント(不自然な滑り)になり、瞬時に差し替えるとクリックが出る。
  //   惑星移動には視覚のトランジション(走査ビーム)があるので、音が一度沈むのは画と合う。
  //   ★S3: 場所の切替(飼育槽↔本部↔巣)も**同じ沈み込み方式**で扱う。ただし場所ごとにグラフの
  //     構造が違う(風+パッド / ハム+tick / ディレイ+心拍)ため、パラメータ差し替えでは足りず、
  //     沈んでいる間に**作り直す**。沈む→替わる→戻るという聴こえ方は惑星移動と完全に同じ。
  //   ★同じ場所・同じ値での再通知では何もしない。画面の開閉やON通知でむやみに音を沈ませないため
  //     (「場所の切替で音が破綻しないこと」の実体はここ)。
  ambient(p) {
    if (!this.enabled || !CFG.soundAmbOn || !p) return false;
    this._ensureCtx();
    if (!this._ctx) return false;
    const sig = this._ambSig(p);
    // 変化なし=触らない。★切替の最中(_ambT が動いている)でも同じことが言える: 予約済みの差し替えが
    //   すでに目的の音を作るので、ここで作り直すとフェードが振り出しに戻って音が二度沈む。
    if (this._amb && this._ambSig(this._ambP) === sig) return true;
    const half = CFG.soundAmbFadeSec / 2;
    if (!this._amb) {
      this._ambBuild(p);
      this._ambRamp(this._amb.out.gain, this._ambLevel(), CFG.soundAmbFadeSec); // 無音から静かに立ち上げる
    } else {
      const rebuild = this._amb.place !== p.place;   // 場所が変わる=構造ごと作り直す
      this._ambRamp(this._amb.out.gain, 0, half);
      if (this._ambT) clearTimeout(this._ambT);
      this._ambT = setTimeout(() => {
        this._ambT = null;
        if (!this._amb) return;
        if (rebuild) { const old = this._amb; this._ambDispose(old); this._ambBuild(p); }
        else this._ambApply(p);
        this._ambRamp(this._amb.out.gain, this._ambLevel(), half);
      }, half * 1000);
    }
    this._ambP = p;
    return true;
  },
  place() { return this._ambP ? this._ambP.place : null; },
  ambientOff() {
    if (!this._amb) return false;
    const a = this._amb;
    this._amb = null; this._ambP = null;
    if (this._ambT) { clearTimeout(this._ambT); this._ambT = null; }
    this._ambRamp(a.out.gain, 0, CFG.soundAmbFadeSec);
    setTimeout(() => this._ambDispose(a), CFG.soundAmbFadeSec * 1000 + 50);
    return true;
  },
  // 音量スライダー等でCFGが変わったときに、鳴らしたまま追従させる(検分ページが使う)
  ambientSyncLevel() { if (this._amb) this._amb.out.gain.value = this._ambLevel(); },

  // テスト器: 環境音の数値ゲート。SEとは物差しが違う(peakでなく持続RMS・定常性・低域比率)
  renderAmbientOffline(p, seconds) {
    if (typeof OfflineAudioContext === "undefined") return Promise.resolve(null);
    const sr = CFG.soundRenderSampleRate;
    const ctx = new OfflineAudioContext(1, Math.ceil(sr * (seconds || CFG.soundAmbRenderSec)), sr);
    this._ambientGraph(ctx, ctx.destination, p);
    return ctx.startRendering().then((buf) => {
      const ch = buf.getChannelData(0), n = ch.length;
      let sum = 0, peak = 0;
      for (let i = 0; i < n; i++) { const x = ch[i]; sum += x * x; const a = x < 0 ? -x : x; if (a > peak) peak = a; }
      const rms = Math.sqrt(sum / n);
      // 定常性: 短い窓のRMSが揃っているか(立ち上がりも減衰も、耳につく揺れも無い=背景に沈む)。
      //   ★窓は短くする必要がある。4等分(1秒窓)にしていた版は**1秒より速い揺れを窓内で平均して見逃し**、
      //     「わざと速く深く揺らす」カナリアに引っかからなかった(=計測が揺れを観測できていなかった)。
      //     100ms窓なら疲れの原因になる数Hzの変動まで見える。
      //   ★S3: 立ち上がりの数百msは**定常性の対象から外す**(soundAmbSteadySkipSec)。巣のフィードバック
      //     ディレイは無音から反響が積み上がるまで時間が要り、その一度きりの立ち上がりが「耳につく揺れ」と
      //     同じ数字になってしまうため。実際には 1.2秒のフェードイン中に隠れており、疲れの原因ではない。
      //     ※飼育槽(承認済み)は立ち上がりを持たない定常信号なので、この除外で数値は動かない=実測で確認する。
      const wlen = Math.max(1, Math.floor(buf.sampleRate * CFG.soundAmbSteadyWinMs / 1000));
      const skip = Math.min(n - wlen * 2, Math.max(0, Math.floor(buf.sampleRate * CFG.soundAmbSteadySkipSec)));
      const W = Math.max(2, Math.floor((n - skip) / wlen)), wr = [];
      for (let w = 0; w < W; w++) {
        let s = 0; const a0 = skip + w * wlen, b0 = Math.min(n, a0 + wlen);
        for (let i = a0; i < b0; i++) s += ch[i] * ch[i];
        wr.push(Math.sqrt(s / Math.max(1, b0 - a0)));
      }
      const steady = Math.max.apply(null, wr) / Math.max(1e-12, Math.min.apply(null, wr));
      // 低域比率: 一次ローパスを通した後のRMS比=風がこもっているか(明るい惑星ほど下がる)
      const k = Math.exp(-2 * Math.PI * CFG.soundAmbLowBandHz / buf.sampleRate);
      let y = 0, ls = 0;
      for (let i = 0; i < n; i++) { y = (1 - k) * ch[i] + k * y; ls += y * y; }
      return { rms: rms, peak: peak, crest: peak / Math.max(1e-12, rms), steady: steady,
        lowRatio: Math.sqrt(ls / n) / Math.max(1e-12, rms), length: n, sampleRate: buf.sampleRate };
    });
  },

  // テスト器: OfflineAudioContext で同じグラフをレンダリングし、数値ゲート(RMS/ピーク/周波数/尺)の材料を返す
  renderOffline(id, seconds) {
    if (typeof OfflineAudioContext === "undefined") return Promise.resolve(null);
    const d = this.def(id);
    if (!d) return Promise.resolve(null);
    const sr = CFG.soundRenderSampleRate;
    const total = seconds || (this._span(d) + CFG.soundRenderPadSec);   // 層があれば最も長い層に合わせる
    const ctx = new OfflineAudioContext(1, Math.ceil(sr * total), sr);
    this._voice(ctx, ctx.destination, d, 0, false);
    return ctx.startRendering().then((buf) => {
      const ch = buf.getChannelData(0);
      let sum = 0, peak = 0;
      for (let i = 0; i < ch.length; i++) { const x = ch[i]; sum += x * x; const ax = x < 0 ? -x : x; if (ax > peak) peak = ax; }
      // 実測周波数: 立ち上がりと余韻を除いた**持続部のゼロ交差**から基本周波数を求める。
      //   単一オシレータ(sine/square/triangle/saw)は1周期に必ず2回交差するため厳密。振幅エンベロープの
      //   影響を受けない。★ノイズ系は交差が乱数的でこの数値は意味を持たない(判定に使わない)。
      //   スイープ(freqEnd)では持続部の平均周波数になる。
      const a = Math.floor(buf.sampleRate * d.attack), b = Math.min(Math.floor(buf.sampleRate * d.dur), ch.length);
      let zc = 0;
      for (let i = a + 1; i < b; i++) { if ((ch[i - 1] < 0) !== (ch[i] < 0)) zc++; }
      const span = (b - a - 1) / buf.sampleRate;
      return { rms: Math.sqrt(sum / ch.length), peak: peak, freqHz: span > 0 ? zc / (2 * span) : 0, length: ch.length, sampleRate: buf.sampleRate };
    });
  },
};
if (typeof module !== "undefined" && module.exports) module.exports = { Sound };
