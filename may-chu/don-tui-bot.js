// Dọn túi cho 24 bot bị đầy túi để nhập MAXPING đủ 170 bot (Huy lệnh 00:37 ngày 29/11/2026).
//
// CHỈ chạy khi máy chủ ĐÃ DỪNG (đóng băng bằng kill -STOP, KHÔNG kill thường — kill thường
// làm chết cả instance Railway, xem CHAY-THAT-2811.md §4). Cách chạy (Railway console, sau khi eval mise):
//   node may-chu/don-tui-bot.js sao-luu
//   node may-chu/don-tui-bot.js thu-kho                        (mô phỏng trên bản sao tạm — không sửa gì)
//   node may-chu/don-tui-bot.js don                            (kiểm tra trước + in kế hoạch bán, chưa sửa gì)
//   node may-chu/don-tui-bot.js don --chay-that
//   node may-chu/don-tui-bot.js khoi-phuc <thu-muc-sao-luu> --chay-that
//
// NGUYÊN TẮC AN TOÀN (đọc kỹ trước khi chạy):
// - Chỉ đúng 24 tài khoản dưới đây (danh sách bot rớt cổng túi ở CHAY-THAT-2811.md §5) —
//   bot khác không đọc cũng không ghi, kể cả 146 bot đã đủ chỗ.
// - CHỈ bán đồ rác + đồ thừa theo đúng luật banRac/banThua (may-chu/bot-kinh-te.js). Luật phân
//   loại TỰ CHỨA trong file này (chép đúng từ bot-kinh-te.js bản làm việc) vì banThua CHƯA có
//   trên live — script không được giả định code kinh tế mới đã deploy. S1/S2 dùng đúng hàm thật
//   KT.chamDiem / KT.macDuoc / KT.s2Thang (đã có trên live). Bán bằng đúng đường DO.lam "ban"
//   (giá NPC, tiền vào túi, món vào danh sách mua lại) — không bịa API, không xóa thẳng.
// - GIỮ TUYỆT ĐỐI: đồ đang mặc (không nằm túi nên không xét), đồ nhiệm vụ (dt), đồ khóa (kbh/het),
//   đồ Hoàng Kim (hk: / it.hk), ngựa (ô Horse), đồ khóa cấp (lớn lên mặc được), món ô trống
//   (để chuyến sau mặc), món ngang/ngon hơn đồ đang mặc, chồng nhiều món (n > 1), món thiếu u.
// - LỆCH DUY NHẤT so với banThua live: banThua chờ gặp lại lần 2 mới bán món "kém đồ đang mặc"
//   (trừ bot <80 hoặc túi <6 chỗ). Lượt dọn này BỎ QUA lượt chờ đó — vì Huy ra lệnh dọn đủ
//   23 chỗ ngay, món đã qua đủ S1 (<80% đồ đang mặc) + S2 (mô phỏng thua), và kế hoạch bán
//   được in hết ở lệnh kiểm tra trước để soát trước khi ghi. Không có ngoại lệ nào khác.
// - Nếu rác + thừa không đủ 23 chỗ ở bot nào thì DỪNG TOÀN BỘ trước khi ghi file nào, báo rõ
//   bot đó + số chỗ còn thiếu + món đang giữ chặn lại — KHÔNG tự xóa/cất món khác.
// - Bắt buộc có bản sao lưu + manifest khớp md5 mới được chạy thật (mẫu migration-bot-chuyen-sinh-9.js).
// - Không đụng acc test1/test2/test3/test4/test5 — chỉ đúng 24 tài khoản trong danh sách dưới đây.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { spawnSync } = require("child_process");
const D = require("./du-lieu.js");
const DO = require("./do.js");
const KT = require("./bot-kinh-te.js");

const ROOT = process.env.VL_DU_LIEU || path.join(__dirname, "..", "du-lieu");
const TK = path.join(ROOT, "tai-khoan");
const CFG_PATH = process.env.VL_NPC_CHOI_CONFIG || path.join(__dirname, "npc-choi-config.json");
const CFG = JSON.parse(fs.readFileSync(CFG_PATH, "utf8"));
const CHE_DO_THU = !!process.env.VL_NPC_CHOI_CONFIG; // cấu hình thử riêng -> mục tiêu = toàn bộ bot trong cấu hình đó

// 24 bot rớt cổng túi ở lần chạy đóng băng 00:17–00:24 ngày 29/11/2026 (túi còn 4–22 chỗ, cần 23).
const DANH_SACH_24 = ["npc006", "npc008", "npc013", "npc018", "npc024", "npc030", "npc031", "npc035",
  "npc041", "npc045", "npc051", "npc056", "npc060", "npc065", "npc068", "npc071",
  "npc075", "npc077", "npc078", "npc079", "npc091", "npc096", "npc102", "npc111"];
const MUC_TIEU = 23; // số ô trống cần có để nhập MAXPING (12 món phái + 2 chồng sách + 8–9 món HK)
const S2_TOI_DA_MOI_BOT = 200; // trần mô phỏng S2 mỗi bot (vượt thì giữ món lại, báo rõ — không đoán)

const BY = DO.NOI.BY;
const md5 = (f) => crypto.createHash("md5").update(fs.readFileSync(f)).digest("hex");
const lenh = process.argv[2];
const chayThat = process.argv.includes("--chay-that");
const tam = process.argv.includes("--tam"); // chạy trên bản sao tạm (thu-kho) — bỏ qua yêu cầu sao lưu
const argThuMuc = process.argv.slice(3).find((a) => !a.startsWith("--"));
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------- dữ liệu cho S2 (chép đúng mobMau của bot-kinh-te.js; mobMau không xuất ra ngoài) ----------
let _S2 = null;
function napS2() {
  if (_S2) return _S2;
  const GOC = path.join(__dirname, "..");
  _S2 = {
    rules: require(path.join(GOC, "src", "game", "rules.js")),
    MS: JSON.parse(fs.readFileSync(path.join(GOC, "assets", "data", "mobstats.json"), "utf8")),
    DEF: JSON.parse(fs.readFileSync(path.join(GOC, "assets", "data", "monsters.json"), "utf8")),
  };
  return _S2;
}
function mobMau(zone, mobId, mobLv) {
  const { rules, MS, DEF } = napS2();
  const B = ((DO.LUAT.canBang || {}).bai || {})[zone] || {};
  const sid = B.chiSo && MS.mobs[B.chiSo] ? B.chiSo : mobId;
  const def = DEF[mobId] || DEF[String(mobId)] || {};
  const st = rules.mobStats(def, sid, mobLv, 0, 75, MS, undefined);
  const km = B.mau ?? 1, kd = B.satThuong ?? 1;
  const hpMax = Math.max(1, Math.round(st.hpMax * km));
  return { loai: "quai", id: mobId, lv: mobLv, hpMax, hpCur: hpMax, mpMax: 100, mpCur: 100,
    series: st.series, def: Math.round(st.def * (B.neTranh ?? 1)), res: st.res,
    dmg: st.dmg.map((v) => Math.round(v * kd)), ar: Math.max(1, Math.round(st.ar * (B.chinhXac ?? 1))),
    exp: st.exp, mau: hpMax };
}

// ---------- luật phân loại (chép đúng từ may-chu/bot-kinh-te.js bản làm việc) ----------
const NGON_DONG_KT = 3; // cùng ngưỡng moSap (npc-choi.js)
const NGON_CHAT_KT = 0.7;
let _DX_TRAN = null;
function dxTran() {
  if (_DX_TRAN) return _DX_TRAN;
  const DX = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets", "data", "dong-xanh.json"), "utf8"));
  const lo = new Map(), hi = new Map();
  for (const r of DX.rows || []) { const p = r.p && r.p[0]; if (!p) continue; lo.set(r.k, Math.min(lo.get(r.k) ?? Infinity, p[0])); hi.set(r.k, Math.max(hi.get(r.k) ?? -Infinity, p[1])); }
  _DX_TRAN = new Map();
  for (const [k, h] of hi) if (h > (lo.get(k) ?? h)) _DX_TRAN.set(k, h);
  return _DX_TRAN;
}
function slotsCua(h, it) {
  const x = BY.get(it.k); if (!x || typeof x.t !== "number") return [];
  let slot = DO.SLOT_OF[x.t]; if (!slot) return [];
  if (slot === "Ring1") {
    if (!h.equip.Ring1) return ["Ring1"];
    if (!h.equip.Ring2) return ["Ring2"];
    return ["Ring1", "Ring2"];
  }
  return [slot];
}
function laTrangBi(it) {
  const x = BY.get(it.k);
  if (!x || typeof x.t !== "number") return false;
  if (x.thuoc || x.ktc || x.phu) return false;
  if (it.kbh || it.het) return false;
  if (x.dung && x.dung.loai === "sach") return false;
  return true;
}
function laDoNgonKT(h, it) {
  if (!laTrangBi(it)) return false;
  if (!slotsCua(h, it).length) return false;
  const d = it.d || [];
  if (d.length >= NGON_DONG_KT) return true;
  if (d.length === 2) {
    const DX_TRAN = dxTran();
    let q = 0;
    for (const [k, v] of d) { const hh = DX_TRAN.get(k); if (hh) q = Math.max(q, v / hh); }
    if (q >= NGON_CHAT_KT) return true;
  }
  return false;
}
function laRacBanDuoc(h, it) {
  if (!laTrangBi(it)) return false;
  if ((it.n | 0) > 1) return false;
  if (it.dt || it.vv || it.tk) return false;
  const x = BY.get(it.k);
  if (!x || x.t === 10) return false; // ngựa (ô Horse): TUYỆT ĐỐI không bán
  if (!slotsCua(h, it).length) return false;
  if (laDoNgonKT(h, it)) return false; // đồ ngon: để bày sạp / xét thừa
  let gb = 0;
  try { gb = DO.giaBan(it) | 0; } catch { gb = 0; }
  return gb > 0;
}
function laDoHKMon(it) { return !!it.hk || String(it.k || "").startsWith("hk:"); }
function laThuaBanDuoc(h, it, cfgBot) {
  if (!laTrangBi(it)) return { thua: false };
  if ((it.n | 0) > 1) return { thua: false };
  if (it.dt || it.vv || it.tk) return { thua: false };
  if (laDoHKMon(it)) return { thua: false };
  const x = BY.get(it.k);
  if (!x || x.t === 10) return { thua: false }; // ngựa: TUYỆT ĐỐI không bán
  if (!slotsCua(h, it).length) return { thua: false };
  let gb = 0;
  try { gb = DO.giaBan(it) | 0; } catch { gb = 0; }
  if (gb <= 0) return { thua: false };
  const gate = KT.macDuoc(h, cfgBot.eqt, it);
  if (!gate.ok) {
    if (gate.why === "sai-gioi" || gate.why === "sai-nhanh-vu-khi") return { thua: true, lyDo: "khong-xai-duoc", gia: gb };
    return { thua: false }; // thiếu cấp / thiếu điểm: lớn lên sẽ mặc được -> giữ
  }
  const slots = slotsCua(h, it);
  const cur = slots.map((s) => h.equip[s]).find(Boolean);
  if (!cur) return { thua: false }; // ô trống: để chuyến sau mặc
  if (KT.chamDiem(h, it) >= KT.chamDiem(h, cur) * 0.8) return { thua: false };
  return { thua: true, lyDo: "kem-do-dang-mac", gia: gb, canS2: true };
}

// ---------- lập kế hoạch bán cho 1 bot (chỉ tính toán trên bản sao, không ghi gì) ----------
// Trả về { ban: [...], giu: [...], s2: n, trongTruoc, trongSau, tien } hoặc { loi }.
function lapKeHoach(acc, h, cfgBot) {
  const mob = mobMau(cfgBot.zone, (cfgBot.mobs || [])[0], cfgBot.mobLv);
  const trongTruoc = DO.NOI.oTrong(h);
  const bag = h.bag || [];
  const thayU = new Set();
  for (const it of bag) {
    if (it.u == null) continue;
    if (thayU.has(it.u)) return { loi: `túi có 2 món trùng u=${it.u} — không đụng để khỏi bán nhầm` };
    thayU.add(it.u);
  }
  const hThu = clone(h), accThu = clone(acc);
  const ban = [], giu = [];
  let s2 = 0;
  const s2Thang = (it) => {
    if (s2 >= S2_TOI_DA_MOI_BOT) return { hetLuot: true };
    s2++;
    try { return KT.s2Thang(hThu, it, mob); }
    catch (e) { return { loiS2: e.message }; }
  };
  for (const it of [...hThu.bag]) {
    if (!hThu.bag.includes(it)) continue; // đã khỏi túi trong vòng này (không xảy ra — chỉ tính, chưa bán)
    const ten = DO.tenMon(it);
    const ghiGiu = (lyDo) => giu.push({ u: it.u, k: it.k, ten, n: it.n | 0, lyDo });
    if (it.u == null) { ghiGiu("thieu-u"); continue; }
    if (!laTrangBi(it)) { ghiGiu("khong-phai-trang-bi"); continue; }
    if ((it.n | 0) > 1) { ghiGiu("chong-nhieu-mon"); continue; }
    if (it.dt) { ghiGiu("do-nhiem-vu"); continue; }
    if (it.vv || it.tk) { ghiGiu("do-dac-biet"); continue; }
    if (it.kbh || it.het) { ghiGiu("do-khoa"); continue; }
    if (laDoHKMon(it)) { ghiGiu("do-hoang-kim"); continue; }
    const x = BY.get(it.k);
    if (x && x.t === 10) { ghiGiu("ngua"); continue; }
    if (!slotsCua(hThu, it).length) { ghiGiu("khong-phai-o-mac-duoc"); continue; }
    let gb = 0;
    try { gb = DO.giaBan(it) | 0; } catch { gb = 0; }
    if (gb <= 0) { ghiGiu("khong-co-gia-ban"); continue; }
    const [w, c] = DO.coMon(it);
    // (1) Rác trước (đúng thứ tự viecThanh: banRac rồi mới banThua).
    if (laRacBanDuoc(hThu, it)) {
      let giuLai = false, lyDoGiu = "";
      if (KT.macDuoc(hThu, cfgBot.eqt, it).ok) {
        const slots = slotsCua(hThu, it);
        const cur = slots.map((s2lot) => hThu.equip[s2lot]).find(Boolean);
        if (!cur) { giuLai = true; lyDoGiu = "o-trong-de-mac"; }
        else if (KT.chamDiem(hThu, it) >= KT.chamDiem(hThu, cur) * 0.8) {
          const r = s2Thang(it);
          if (r.hetLuot) { giuLai = true; lyDoGiu = "het-luot-s2"; }
          else if (r.loiS2) return { loi: `S2 lỗi ở món ${ten} (u=${it.u}): ${r.loiS2} — dừng, không đoán` };
          else if (r.thang) { giuLai = true; lyDoGiu = "s2-thang-do-dang-mac"; }
        }
      }
      if (giuLai) { ghiGiu(lyDoGiu); continue; }
      ban.push({ u: it.u, k: it.k, ten, n: it.n | 0, loai: "rac", lyDo: "do-rac", gia: gb, o: w * c });
      continue;
    }
    // (2) Thừa (đúng laThuaBanDuoc; lượt chờ gặp-lại được bỏ qua theo lệnh dọn — xem đầu file).
    const kq = laThuaBanDuoc(hThu, it, cfgBot);
    if (!kq.thua) { ghiGiu(kq.lyDo || "khong-thua"); continue; }
    if (kq.canS2) {
      const r = s2Thang(it);
      if (r.hetLuot) { ghiGiu("het-luot-s2"); continue; }
      if (r.loiS2) return { loi: `S2 lỗi ở món ${ten} (u=${it.u}): ${r.loiS2} — dừng, không đoán` };
      if (r.thang) { ghiGiu("s2-thang-do-dang-mac"); continue; }
    }
    ban.push({ u: it.u, k: it.k, ten, n: it.n | 0, loai: "thua", lyDo: kq.lyDo, gia: gb, o: w * c });
  }
  // Áp kế hoạch lên bản sao bằng đúng đường bán thật, rồi kiểm chứng số ô + tiền.
  const goldTruoc = hThu.gold | 0;
  for (const m of ban) {
    try { DO.lam(hThu, { act: "ban", u: m.u }, cfgBot.acct, accThu); }
    catch (e) { return { loi: `bán thử món ${m.ten} (u=${m.u}) hỏng: ${e.message} — dừng, không đoán` }; }
  }
  const trongSau = DO.NOI.oTrong(hThu);
  const tien = (hThu.gold | 0) - goldTruoc;
  const tienTinh = ban.reduce((t, m) => t + m.gia, 0);
  if (tien !== tienTinh) return { loi: `tiền bán thử lệch: thực ${tien}, tính ${tienTinh} — dừng, không đoán` };
  const uConLai = new Set(hThu.bag.map((o) => o.u));
  for (const m of ban) if (uConLai.has(m.u)) return { loi: `món ${m.ten} (u=${m.u}) bán thử rồi vẫn còn trong túi — dừng` };
  return { ban, giu, s2, trongTruoc, trongSau, tien };
}

// ---------- kiểm tra / sao lưu (mẫu nhap-maxping-bot.js) ----------
function mucTieuBot() {
  if (CHE_DO_THU) return (CFG.bots || []).map((b) => b.acct);
  return [...DANH_SACH_24];
}
function cfgCua(acct) { return (CFG.bots || []).find((b) => b.acct === acct) || null; }
function nhanVat(acc, cfgBot) {
  const h = acc && Array.isArray(acc.nv) ? acc.nv[0] : null;
  if (!h) return { loi: "không có nhân vật ô 1" };
  if (h.name !== cfgBot.ten || String(h.fac) !== String(cfgBot.fac)) return { loi: `nhân vật khác (${h.name}, fac ${h.fac}) — không ghi đè` };
  return { h };
}
function kiemTra() {
  const loi = [], lam = [], boQua = [];
  for (const acct of mucTieuBot()) {
    const cfgBot = cfgCua(acct);
    if (!cfgBot) { loi.push(`${acct}: không có trong npc-choi-config.json — dừng lại`); continue; }
    const f = path.join(TK, acct + ".json");
    if (!fs.existsSync(f)) { loi.push(`${acct}: thiếu file tài khoản`); continue; }
    const acc = D.docTk(acct);
    if (!acc) { loi.push(`${acct}: không đọc được file`); continue; }
    const { h, loi: loiNv } = nhanVat(acc, cfgBot);
    if (loiNv) { loi.push(`${acct}: ${loiNv}`); continue; }
    if (!Array.isArray(h.bag)) { loi.push(`${acct}: túi không phải mảng`); continue; }
    let keHoach;
    try { keHoach = lapKeHoach(acc, h, cfgBot); }
    catch (e) { loi.push(`${acct}: lập kế hoạch lỗi: ${e.message}`); continue; }
    if (keHoach.loi) { loi.push(`${acct}: ${keHoach.loi}`); continue; }
    const co = { cfgBot, acc, h, trongTruoc: keHoach.trongTruoc, trongSau: keHoach.trongSau, tien: keHoach.tien, ban: keHoach.ban, giu: keHoach.giu, s2: keHoach.s2 };
    if (keHoach.trongTruoc >= MUC_TIEU) { boQua.push({ ...co, lyDo: `đã đủ ${keHoach.trongTruoc} chỗ trống (cần ${MUC_TIEU})` }); continue; }
    if (keHoach.trongSau < MUC_TIEU) {
      const thieu = MUC_TIEU - keHoach.trongSau;
      const giuNhom = {};
      for (const g of keHoach.giu) giuNhom[g.lyDo] = (giuNhom[g.lyDo] || 0) + 1;
      loi.push(`${h.name} (${acct}): rác + thừa chỉ dọn được tới ${keHoach.trongSau} chỗ (đang ${keHoach.trongTruoc}), còn thiếu ${thieu} chỗ — món đang giữ: ${Object.entries(giuNhom).map(([k, v]) => `${k} ${v}`).join(", ")} — DỪNG, không tự xóa/cất món khác`);
      co.giuChiTiet = keHoach.giu;
      loi.giuChiTiet = loi.giuChiTiet || {};
      loi.giuChiTiet[acct] = keHoach.giu;
      continue;
    }
    lam.push(co);
  }
  return { loi, lam, boQua };
}
function danhSach() {
  const co = [], thieu = [];
  for (const a of mucTieuBot()) {
    const f = path.join(TK, a + ".json");
    if (fs.existsSync(f)) co.push({ acct: a, file: f, bytes: fs.statSync(f).size, md5: md5(f) });
    else thieu.push(a);
  }
  return { co, thieu };
}
function thuMucMoi(nhan) {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return path.join(ROOT, `${nhan}-${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`);
}
function thuMucMoiNhat(nhan) {
  const ds = fs.readdirSync(ROOT).filter((n) => n.startsWith(nhan + "-")).sort();
  return ds.length ? path.join(ROOT, ds[ds.length - 1]) : null;
}
function kiemCauHinh() {
  const ds = mucTieuBot();
  if (!ds.length) { console.error("DANH SÁCH RỖNG: không có bot nào — kiểm tra npc-choi-config.json."); process.exit(1); }
  if (!CHE_DO_THU && ds.length !== 24) { console.error(`DANH SÁCH LỆCH: ${ds.length} bot (cần đúng 24) — dừng lại.`); process.exit(1); }
}
function kiemSaoLuu(dir) {
  if (!dir || !fs.existsSync(path.join(dir, "manifest.json"))) { console.error("KHÔNG THẤY bản sao lưu (manifest.json) — chạy sao-luu trước. Dừng lại."); process.exit(1); }
  const man = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  const { co, thieu } = danhSach();
  let khop = 0;
  for (const m of man.files) {
    const hien = co.find((c) => c.acct === m.acct);
    if (hien && hien.md5 === m.md5) khop++;
    else console.log(`  LỆCH/KHÁC: ${m.acct} (sao lưu md5 ${m.md5}, hiện tại ${hien ? hien.md5 : "không có file"})`);
  }
  const tong = man.files.length;
  console.log(`bản sao lưu: ${dir}. khớp md5: ${khop}/${tong}`);
  if (thieu.length) { console.error(`Thiếu file: ${thieu.join(", ")} — dừng lại.`); process.exit(1); }
  if (khop !== tong) { console.error("KHÔNG ĐỦ file khớp sao lưu — máy chủ có thể đang chạy (luu() ghi đè). DỪNG MÁY CHỦ, sao-luu lại, rồi chạy lại."); process.exit(1); }
  return man;
}

// Áp dụng cho 1 bot: bán đúng danh sách u trong kế hoạch, ghi file ngay, đọc lại kiểm chứng.
function donMot(co) {
  const { cfgBot } = co;
  const acc = D.docTk(cfgBot.acct);
  const { h, loi: loiNv } = nhanVat(acc, cfgBot);
  if (loiNv) throw new Error(loiNv);
  const trongTruoc = DO.NOI.oTrong(h), goldTruoc = h.gold | 0;
  const uGiu = new Set((h.bag || []).map((o) => o.u)) ;
  for (const m of co.ban) uGiu.delete(m.u);
  for (const m of co.ban) {
    try { DO.lam(h, { act: "ban", u: m.u }, cfgBot.acct, acc); }
    catch (e) { throw new Error(`bán ${m.ten} (u=${m.u}) hỏng: ${e.message} — file bot này KHÔNG ghi, chạy lại sau khi sửa được`); }
  }
  const trongSau = DO.NOI.oTrong(h);
  const tien = (h.gold | 0) - goldTruoc;
  if (trongSau < MUC_TIEU) throw new Error(`sau bán chỉ còn ${trongSau} chỗ (cần ${MUC_TIEU}) — file KHÔNG ghi`);
  if (tien !== co.tien) throw new Error(`tiền bán lệch: thực ${tien}, kế hoạch ${co.tien} — file KHÔNG ghi`);
  for (const u of uGiu) if (!(h.bag || []).some((o) => o.u === u)) throw new Error(`món đang giữ u=${u} biến mất lúc bán — file KHÔNG ghi`);
  D.ghiTk(acc);
  const sau = D.docTk(cfgBot.acct), hSau = sau && sau.nv && sau.nv[0];
  if (!hSau) throw new Error("đọc lại thất bại sau khi ghi");
  if (DO.NOI.oTrong(hSau) < MUC_TIEU) throw new Error("đọc lại: chưa đủ chỗ — DỪNG, khôi phục từ sao lưu ngay");
  if ((hSau.gold | 0) - goldTruoc !== co.tien) throw new Error("đọc lại: tiền lệch — DỪNG, khôi phục từ sao lưu ngay");
  return { ten: h.name, trongTruoc, trongSau: DO.NOI.oTrong(hSau), tien, rac: co.ban.filter((m) => m.loai === "rac").length, thua: co.ban.filter((m) => m.loai === "thua").length };
}

if (lenh === "sao-luu") {
  kiemCauHinh();
  const { co, thieu } = danhSach();
  console.log(`tìm thấy ${co.length}/${mucTieuBot().length} file, thiếu: ${thieu.join(", ") || "không"}`);
  const dir = thuMucMoi("sao-luu-don-tui");
  fs.mkdirSync(dir, { recursive: true });
  const ghi = [];
  for (const f of co) { fs.copyFileSync(f.file, path.join(dir, f.acct + ".json")); ghi.push({ acct: f.acct, bytes: f.bytes, md5: f.md5 }); }
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ ngay: new Date().toISOString(), root: ROOT, mucTieu: "don tui 24 bot -> du 23 o trong", files: ghi }, null, 1) + "\n");
  console.log("sao lưu riêng file bot ->", dir);
  const sl = D.saoLuu();
  console.log("sao lưu toàn bộ (D.saoLuu):", sl ? JSON.stringify(sl) : "(không trả về)");
  console.log("XONG sao-luu. Kiểm lại thư mục trên rồi mới chạy bước don.");
} else if (lenh === "thu-kho") {
  // Mô phỏng trên bản sao tạm trong /tmp: không sửa dữ liệu thật.
  kiemCauHinh();
  const truoc = danhSach().co.map((c) => ({ acct: c.acct, md5: c.md5 }));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dontui-thu-"));
  try {
    fs.mkdirSync(path.join(tmp, "tai-khoan"), { recursive: true });
    const { co } = danhSach();
    for (const f of co) fs.copyFileSync(f.file, path.join(tmp, "tai-khoan", f.acct + ".json"));
    const env = { ...process.env, VL_DU_LIEU: tmp };
    if (process.env.VL_NPC_CHOI_CONFIG) env.VL_NPC_CHOI_CONFIG = process.env.VL_NPC_CHOI_CONFIG;
    const kq = spawnSync(process.execPath, [__filename, "don", "--chay-that", "--tam"], { env, encoding: "utf8", stdio: "pipe" });
    process.stdout.write(kq.stdout || "");
    process.stderr.write(kq.stderr || "");
    if (kq.status !== 0) { console.error("MÔ PHỎNG LỖI — dữ liệu thật không bị sửa."); process.exit(kq.status || 1); }
    const bc = JSON.parse(fs.readFileSync(path.join(tmp, "bao-cao-don-tui.json"), "utf8"));
    console.log(`\nTHỬ KHÔ XONG (trên bản sao ${tmp}): dọn ${bc.don.length}, bỏ qua ${bc.boQua.length}, lỗi ${bc.loi.length}. Dữ liệu thật KHÔNG bị sửa.`);
    console.log(`Tổng mô phỏng: bán ${bc.tong.mon} món (+${bc.tong.tien.toLocaleString("en-US")} lượng), chỗ trống sau dọn tối thiểu ${bc.tong.trongSauMin} ô.`);
    const sau = danhSach().co;
    const lech = truoc.filter((t) => { const s = sau.find((x) => x.acct === t.acct); return !s || s.md5 !== t.md5; });
    if (lech.length) { console.error("DỮ LIỆU THẬT BỊ ĐỔI trong lúc thử khô:", lech.map((x) => x.acct).join(", ")); process.exit(1); }
    console.log(`md5 dữ liệu thật khớp ${truoc.length}/${truoc.length} sau thử khô.`);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
} else if (lenh === "don") {
  kiemCauHinh();
  if (CHE_DO_THU) console.log("CHẾ ĐỘ THỬ: cấu hình riêng (VL_NPC_CHOI_CONFIG) — mục tiêu = toàn bộ bot trong cấu hình đó.");
  const dir = tam ? null : (argThuMuc || thuMucMoiNhat("sao-luu-don-tui"));
  if (chayThat && !tam) kiemSaoLuu(dir);
  if (!chayThat) console.log("KIỂM TRA TRƯỚC — chưa sửa gì. Chạy lại với --chay-that để dọn thật.");
  const { loi, lam, boQua } = kiemTra();
  console.log(`dọn được: ${lam.length}, bỏ qua (đã đủ chỗ): ${boQua.length}, lỗi cứng: ${loi.length}`);
  for (const s of boQua) console.log(`  BỎ QUA: ${s.h.name} (${s.cfgBot.acct}): ${s.lyDo}`);
  for (const s of lam) {
    const rac = s.ban.filter((m) => m.loai === "rac").length, thua = s.ban.filter((m) => m.loai === "thua").length;
    console.log(`  DỌN: ${s.h.name} (${s.cfgBot.acct}): trống ${s.trongTruoc} → ${s.trongSau} ô, bán ${s.ban.length} món (rác ${rac}, thừa ${thua}), +${s.tien.toLocaleString("en-US")} lượng, S2 ${s.s2} lượt`);
  }
  for (const s of loi) console.log("  LỖI:", s);
  if (loi.giuChiTiet) for (const [acct, giu] of Object.entries(loi.giuChiTiet)) {
    console.log(`  MÓN ĐANG GIỮ ở ${acct}:`);
    for (const g of giu) console.log(`    GIỮ: u=${g.u} ${g.ten} (${g.k}, n=${g.n}): ${g.lyDo}`);
  }
  if (loi.length) { console.error("CÓ LỖI CỨNG — dừng lại, chưa sửa file nào."); process.exit(1); }
  if (!chayThat) {
    const tien = lam.reduce((t, c) => t + c.tien, 0), mon = lam.reduce((t, c) => t + c.ban.length, 0);
    console.log(`SẼ DỌN (nếu chạy thật): ${lam.length} bot, bán ${mon} món, +${tien.toLocaleString("en-US")} lượng, mọi bot ≥ ${MUC_TIEU} ô trống.`);
    process.exit(0);
  }
  const ketQua = { don: [], boQua: boQua.map((b) => `${b.h.name}: ${b.lyDo}`), loi: [], tong: { tien: 0, mon: 0, trongSauMin: Infinity } };
  for (const co of lam) {
    try {
      const kq = donMot(co);
      ketQua.don.push(`${kq.ten}: trống ${kq.trongTruoc} → ${kq.trongSau} ô, bán ${kq.rac + kq.thua} món (rác ${kq.rac}, thừa ${kq.thua}), +${kq.tien.toLocaleString("en-US")} lượng`);
      ketQua.tong.tien += kq.tien; ketQua.tong.mon += kq.rac + kq.thua;
      ketQua.tong.trongSauMin = Math.min(ketQua.tong.trongSauMin, kq.trongSau);
    } catch (e) {
      ketQua.loi.push(`${co.h.name}: ${e.message} — DỪNG, kiểm tra trước khi khởi động lại máy chủ`);
      break;
    }
  }
  if (!ketQua.don.length) ketQua.tong.trongSauMin = 0;
  console.log(`dọn: ${ketQua.don.length}, bỏ qua: ${ketQua.boQua.length}, lỗi: ${ketQua.loi.length}`);
  for (const s of ketQua.don) console.log("  DỌN:", s);
  for (const s of ketQua.boQua) console.log("  BỎ QUA:", s);
  for (const s of ketQua.loi) console.log("  LỖI:", s);
  fs.writeFileSync(path.join(tam ? ROOT : (dir || ROOT), "bao-cao-don-tui.json"), JSON.stringify(ketQua, null, 1) + "\n");
  if (ketQua.loi.length) { console.error("CÓ LỖI — kiểm tra trước khi khởi động lại máy chủ."); process.exit(1); }
  console.log("XONG don. Chạy tiếp nhap-maxping-bot.js (kiểm tra trước phải ra 170/170) rồi mới khởi động lại máy chủ.");
} else if (lenh === "khoi-phuc") {
  const dir = argThuMuc || thuMucMoiNhat("sao-luu-don-tui");
  if (!dir || !fs.existsSync(path.join(dir, "manifest.json"))) { console.error("KHÔNG THẤY bản sao lưu (manifest.json). Dừng lại."); process.exit(1); }
  const man = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  console.log(`khôi phục từ: ${dir} (${man.files.length} file)`);
  if (!chayThat) { console.log("THỬ KHÔ — chưa chép gì. Chạy lại với --chay-that để khôi phục thật."); process.exit(0); }
  let dem = 0;
  for (const m of man.files) {
    const nguon = path.join(dir, m.acct + ".json"), dich = path.join(TK, m.acct + ".json");
    fs.copyFileSync(nguon, dich);
    if (md5(dich) !== m.md5) { console.error("MD5 LỆCH sau chép:", m.acct); process.exit(1); }
    dem++;
  }
  console.log(`đã khôi phục ${dem} file. Khởi động lại máy chủ như cũ.`);
} else {
  console.log("Dùng: node may-chu/don-tui-bot.js <sao-luu|thu-kho|don|khoi-phuc> [thu-muc-sao-luu] [--chay-that]");
  process.exit(1);
}
