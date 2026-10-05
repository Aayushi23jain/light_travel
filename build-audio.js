// One-off build script: copy per-language VO clips from the extracted Unity zip into
// assets/audio/<lang>/<key>.mp3 and emit assets/audio/manifest.json.
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', '_extract', 'lightaudio', 'cg-84-light-travels-in-straight-line-main', 'Assets', 'ENG');
const OUT = path.join(__dirname, 'assets', 'audio');

const num = f => { const m = f.match(/^\(?(\d+)/); return m ? +m[1] : null; };

// semantic key -> matcher(source filename)
const byNum = n => f => num(f) === n;
const byName = s => f => f.toLowerCase().includes(s.toLowerCase());

const LANGS = {
  en: { dir: '.', map: { intro: byNum(1), next: byNum(2), simIntro: byNum(3), concept: byNum(4), lightCandle: byNum(5), placePipe: byNum(6), correct: byNum(7), incorrect: byNum(8), bendPipe: byNum(9), pipeStraight: byNum(10), activityComplete: byNum(11), clickTorch: byNum(12), holesNotAligned: byNum(13), adjustCardboard: byNum(14), holesAligned: byNum(15), moveUpDown: byNum(16), allAligned: byNum(17), experimentComplete: byNum(18), quizStart: byNum(19), summaryIntro: byNum(20), summary: byNum(21) } },
  hi: { dir: 'Hindi', map: { intro: byNum(1), next: byNum(2), simIntro: byNum(3), concept: byNum(4), lightCandle: byNum(5), placePipe: byNum(6), correct: byNum(7), incorrect: byNum(8), bendPipe: byNum(9), pipeStraight: byNum(10), activityComplete: byNum(11), clickTorch: byNum(12), holesNotAligned: byNum(13), adjustCardboard: byNum(14), holesAligned: byNum(15), moveUpDown: byNum(16), allAligned: byNum(17), experimentComplete: byNum(18), quizStart: byNum(19), summaryIntro: byNum(22), summary: byNum(23) } },
  te: { dir: 'Light travels in a straight line_telugu', map: { intro: byNum(1), next: byNum(2), simIntro: byNum(3), concept: byNum(4), lightCandle: byNum(5), placePipe: byNum(6), correct: byNum(7), incorrect: byNum(8), bendPipe: byNum(9), pipeStraight: byNum(10), activityComplete: byNum(11), clickTorch: byNum(12), holesNotAligned: byNum(13), adjustCardboard: byNum(14), holesAligned: byNum(15), moveUpDown: byNum(16), allAligned: byNum(17), experimentComplete: byNum(18), quizStart: byNum(19), summaryIntro: byNum(20), summary: byNum(21) } },
  gu: { dir: 'LightGujrati', map: { intro: byNum(1), next: byNum(2), simIntro: byNum(3), concept: byNum(4), lightCandle: byNum(5), placePipe: byNum(6), correct: f => num(f) === null && /correct/i.test(f) && !/incorrect/i.test(f), incorrect: f => num(f) === null && /incorrect/i.test(f), bendPipe: byNum(8), pipeStraight: byNum(10), activityComplete: byNum(11), clickTorch: byNum(12), holesNotAligned: byNum(14), adjustCardboard: byNum(15), holesAligned: byNum(16), moveUpDown: byNum(18), allAligned: byNum(19), experimentComplete: byNum(25), quizStart: byNum(17), summaryIntro: byNum(36), summary: f => num(f) === null && /^Light travels in/i.test(f) } },
  mr: { dir: 'Marathi', map: { intro: byNum(1), next: byNum(2), simIntro: byNum(3), concept: byNum(4), lightCandle: byNum(5), placePipe: byNum(6), correct: byNum(7), incorrect: byNum(8), bendPipe: byNum(9), pipeStraight: byNum(12), activityComplete: byNum(13), clickTorch: byNum(14), holesNotAligned: byNum(17), adjustCardboard: byNum(18), holesAligned: byNum(19), moveUpDown: byNum(22), allAligned: byNum(23), experimentComplete: byNum(24), quizStart: byNum(25), summaryIntro: byNum(28), summary: byNum(29) } },
};

fs.mkdirSync(OUT, { recursive: true });
const manifest = {};
for (const [lang, cfg] of Object.entries(LANGS)) {
  const dir = path.join(SRC, cfg.dir);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.mp3'));
  manifest[lang] = {};
  const d = path.join(OUT, lang); fs.mkdirSync(d, { recursive: true });
  for (const [key, match] of Object.entries(cfg.map)) {
    const hit = files.find(match);
    if (!hit) { console.warn('MISSING', lang, key); continue; }
    const dest = path.join(d, key + '.mp3');
    fs.copyFileSync(path.join(dir, hit), dest);
    manifest[lang][key] = lang + '/' + key + '.mp3';
  }
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log('manifest keys per lang:', Object.entries(manifest).map(([l, m]) => l + '=' + Object.keys(m).length).join(' '));
