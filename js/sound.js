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

  def(id) { return (typeof CFG !== "undefined" && CFG.soundDefs && CFG.soundDefs[id]) || null; },
  prio(id) { return (typeof CFG !== "undefined" && CFG.soundPriority && CFG.soundPriority[id]) || 0; },

  // 発音の可否(純ロジック=クロック注入でテスト可能): 同一SEの最小間隔+ボイスプール+優先度の追加枠
  _admit(id, t) {
    const gap = (typeof CFG !== "undefined" && CFG.soundMinGapMs != null) ? CFG.soundMinGapMs : 60;
    if (this._last[id] != null && t - this._last[id] < gap) return false;
    const cap = (typeof CFG !== "undefined" && CFG.soundMaxVoices != null) ? CFG.soundMaxVoices : 8;
    if (this._voices < cap) return true;
    // 満杯: 高優先(soundPrioFloor 以上=ボス撃破/石の生成)だけ追加枠を使える
    const floor = (typeof CFG !== "undefined" && CFG.soundPrioFloor != null) ? CFG.soundPrioFloor : 4;
    const extra = (typeof CFG !== "undefined" && CFG.soundPrioExtra != null) ? CFG.soundPrioExtra : 2;
    return this.prio(id) >= floor && this._voices < cap + extra;
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
    if (this.log.length > 64) this.log.shift();
    this._ensureCtx();
    if (this._ctx) this._voice(this._ctx, this._ctx.destination, d, this._ctx.currentTime, true);
    return true;
  },

  // 音声グラフの単一実装: 実再生(play)とオフライン検査(renderOffline)が同じ関数を通る=単一の真実
  _voice(ctx, dest, d, when, count) {
    const master = ((typeof CFG !== "undefined" && CFG.soundMaster != null) ? CFG.soundMaster : 0.5)
      * ((typeof CFG !== "undefined" && CFG.soundSeVol != null) ? CFG.soundSeVol : 1);
    const vol = (d.vol != null ? d.vol : 0.5) * master;
    const t0 = when, a = d.attack || 0.005, dur = d.dur || 0.1, rel = d.release || 0.05;
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
      let seed = ((d.seed != null ? d.seed : 12345) >>> 0) || 1;
      for (let i = 0; i < len; i++) { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed ^= seed << 5; seed >>>= 0; ch[i] = (seed / 4294967295) * 2 - 1; }
      src = ctx.createBufferSource(); src.buffer = buf;
      if (d.filterFreq) { const f = ctx.createBiquadFilter(); f.type = d.filterType || "lowpass"; f.frequency.value = d.filterFreq; src.connect(f); f.connect(g); }
      else src.connect(g);
    } else {
      src = ctx.createOscillator();
      src.type = d.type || "sine";
      src.frequency.setValueAtTime(d.freq || 440, t0);
      if (d.freqEnd) src.frequency.linearRampToValueAtTime(d.freqEnd, t0 + dur);
      src.connect(g);
    }
    if (count) {
      this._voices++;
      src.onended = () => { this._voices = Math.max(0, this._voices - 1); };
    }
    src.start(t0);
    src.stop(t0 + dur + rel + 0.01);
    return { src: src, gain: g };
  },

  // テスト器: OfflineAudioContext で同じグラフをレンダリングし、数値ゲート(RMS/ピーク/尺)の材料を返す
  renderOffline(id, seconds) {
    if (typeof OfflineAudioContext === "undefined") return Promise.resolve(null);
    const d = this.def(id);
    if (!d) return Promise.resolve(null);
    const sr = 44100;
    const total = seconds || ((d.dur || 0.1) + (d.release || 0.05) + 0.05);
    const ctx = new OfflineAudioContext(1, Math.ceil(sr * total), sr);
    this._voice(ctx, ctx.destination, d, 0, false);
    return ctx.startRendering().then((buf) => {
      const ch = buf.getChannelData(0);
      let sum = 0, peak = 0;
      for (let i = 0; i < ch.length; i++) { const x = ch[i]; sum += x * x; const ax = x < 0 ? -x : x; if (ax > peak) peak = ax; }
      return { rms: Math.sqrt(sum / ch.length), peak: peak, length: ch.length, sampleRate: buf.sampleRate };
    });
  },
};
if (typeof module !== "undefined" && module.exports) module.exports = { Sound };
