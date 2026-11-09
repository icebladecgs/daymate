// vCard(.vcf) 연락처 파일 읽기 (2026-11-09) — 아이폰·삼성 인터넷처럼 연락처 선택 창이 없는 기기용.
// 기기 안에서만 읽고 밖으로 보내지 않는다. 결과는 연락처 선택 창(navigator.contacts.select)과 같은 모양
// [{ name: [], tel: [], email: [], org: [], title: [], bday: { month, day, year } | null }]이라
// buildImportCandidates·가져오기 창을 그대로 쓴다.
//
// 처리하는 것: vCard 2.1·3.0·4.0, 접힌 줄(다음 줄이 공백으로 시작), 안드로이드 내보내기의
// QUOTED-PRINTABLE(=EA=B9=80…, 줄 끝 = 로 이어짐)·CHARSET, item1.TEL 같은 그룹 이름, \, \; \n 이스케이프.
// 사진(PHOTO)·주소 등 나머지 칸은 읽지 않는다.

function decodeQP(value, charset) {
  const bytes = [];
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "=" && /^[0-9A-Fa-f]{2}$/.test(value.slice(i + 1, i + 3))) {
      bytes.push(parseInt(value.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      // 글자는 UTF-8 바이트로 (보통 영문·숫자뿐)
      for (const b of new TextEncoder().encode(ch)) bytes.push(b);
    }
  }
  try { return new TextDecoder(charset || "utf-8").decode(new Uint8Array(bytes)); }
  catch { return new TextDecoder("utf-8").decode(new Uint8Array(bytes)); }
}

const unescapeText = (s) => s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");

// 이스케이프되지 않은 ; 로 나누기 (N·ORG 칸)
function splitParts(s) {
  const out = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && i + 1 < s.length) { cur += s[i] + s[i + 1]; i++; continue; }
    if (s[i] === ";") { out.push(cur); cur = ""; continue; }
    cur += s[i];
  }
  out.push(cur);
  return out.map(unescapeText);
}

// 1990-05-03 · 19900503 · --05-03 · --0503 · 1990-05-03T00:00:00Z
export function parseBday(v) {
  const s = String(v || "").trim();
  let m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (m) return valid(+m[2], +m[3], +m[1]);
  m = s.match(/^--(\d{2})-?(\d{2})/);
  if (m) return valid(+m[1], +m[2], null);
  return null;
}
function valid(month, day, year) {
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null;
  // 연도 없는 생일을 1604년으로 적는 프로그램(애플)이 있다
  return { month, day, year: year && year > 1900 ? year : null };
}

// 한 줄을 { name, params, value }로 — 값 안의 ":"는 그대로 두고 처음 ":"에서 나눈다(매개변수의 따옴표 안은 건너뜀)
function splitLine(line) {
  let q = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') q = !q;
    else if (line[i] === ":" && !q) {
      const head = line.slice(0, i).split(";");
      const name = head[0].replace(/^[^.]*\./, "").toUpperCase(); // item1.TEL → TEL
      const params = {};
      head.slice(1).forEach((p) => {
        const [k, ...rest] = p.split("=");
        // 2.1의 맨 매개변수(TEL;CELL;QUOTED-PRINTABLE)
        if (!rest.length) { params[k.toUpperCase()] = true; return; }
        params[k.toUpperCase()] = rest.join("=").replace(/^"|"$/g, "");
      });
      return { name, params, value: line.slice(i + 1) };
    }
  }
  return null;
}

// 접힌 줄 펼치기 + QUOTED-PRINTABLE 줄 끝 "=" 이어 붙이기
function logicalLines(text) {
  const raw = String(text || "").replace(/^\uFEFF/, "").split(/\r\n|\r|\n/);
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    let line = raw[i];
    if (/^[ \t]/.test(line) && out.length) { out[out.length - 1] += line.slice(1); continue; }
    if (/QUOTED-PRINTABLE/i.test(line.split(":")[0])) {
      while (line.endsWith("=") && i + 1 < raw.length) { line = line.slice(0, -1) + raw[++i]; }
    }
    out.push(line);
  }
  return out;
}

export function parseVCards(text) {
  const cards = [];
  let cur = null;
  for (const line of logicalLines(text)) {
    if (/^BEGIN:VCARD/i.test(line)) { cur = { fn: "", n: "", tel: [], email: [], org: [], title: [], bday: null }; continue; }
    if (/^END:VCARD/i.test(line)) {
      if (cur) {
        const name = (cur.fn || cur.n).normalize("NFC").trim();
        if (name || cur.tel.length) {
          cards.push({ name: name ? [name] : [], tel: cur.tel, email: cur.email, org: cur.org, title: cur.title, bday: cur.bday });
        }
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const p = splitLine(line);
    if (!p) continue;
    const qp = p.params.ENCODING ? /QUOTED-PRINTABLE/i.test(p.params.ENCODING) : !!p.params["QUOTED-PRINTABLE"];
    const value = qp ? decodeQP(p.value, p.params.CHARSET) : p.value;
    switch (p.name) {
      case "FN": cur.fn = unescapeText(value).trim(); break;
      case "N": {
        // 성;이름;중간;접두;접미 — 한글 이름은 붙여 쓰고(김철수), 영문은 이름 성 순서로 띄어 쓴다
        const [family = "", given = "", middle = ""] = splitParts(value).map((x) => x.trim());
        const korean = /[가-힣]/.test(family + given);
        cur.n = korean ? `${family}${given}${middle}` : [given, middle, family].filter(Boolean).join(" ");
        break;
      }
      case "TEL": { const v = value.replace(/^tel:/i, "").trim(); if (v) cur.tel.push(v); break; }
      case "EMAIL": { const v = value.trim(); if (v) cur.email.push(v); break; }
      case "ORG": { const v = splitParts(value)[0].trim(); if (v) cur.org.push(v); break; }
      case "TITLE": { const v = unescapeText(value).trim(); if (v) cur.title.push(v); break; }
      case "BDAY": cur.bday = parseBday(value); break;
      default: break;
    }
  }
  return cards;
}
