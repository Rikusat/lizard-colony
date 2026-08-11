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

  setEnabled(v) { this.enabled = !!v; if (this.enabled) this._ensureCtx(); },
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

  // 音声グラフの単一実装: 実再生(play)とオフライン検査(renderOffline)が同じ関数を通る=単一の真実
  _voice(ctx, dest, d, when, count) {
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
    if (count) {
      this._voices++;
      src.onended = () => { this._voices = Math.max(0, this._voices - 1); };
    }
    src.start(t0);
    src.stop(t0 + dur + rel + CFG.soundStopPadSec);
    return { src: src, gain: g };
  },

  // テスト器: OfflineAudioContext で同じグラフをレンダリングし、数値ゲート(RMS/ピーク/周波数/尺)の材料を返す
  renderOffline(id, seconds) {
    if (typeof OfflineAudioContext === "undefined") return Promise.resolve(null);
    const d = this.def(id);
    if (!d) return Promise.resolve(null);
    const sr = CFG.soundRenderSampleRate;
    const total = seconds || (d.dur + d.release + CFG.soundRenderPadSec);
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
