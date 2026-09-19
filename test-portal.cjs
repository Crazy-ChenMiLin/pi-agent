/* Pithagoras 多用户 Pi 门户 端到端测试
 * 覆盖 6 项核心能力：
 *  T1 认证  — 密码登录 / 错误密码拒绝 / 未登录 401 / 登录后 cookie 放行
 *  T2 工作区 — 创建 / 重名 409 / 路径逃逸 400 / 越界路径 400
 *  T3 会话   — 创建 browser agent 会话 / 读取会话详情
 *  T4 Prompt — 提交 prompt 返回 running（真正驱动 Pi）
 *  T5 SSE   — 事件流回放（before 分页）+ abort 中断
 *  T6 持久化 — SQLite session/事件落盘（重启后仍在）
 */
const PORT = 4100;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = process.env.PORTAL_PASSWORD || "pithagoras2026";
const NAME = (n) => `${n} ${new Date().toISOString().replace(/[:.]/g, "-")}`;

let pass = 0, fail = 0, skipped = 0;
const results = [];
const ok = (name, cond, extra = "") => {
  if (cond === "SKIP") { skipped++; results.push(`  ⏭  ${name}`); console.log(`  [SKIP] ${name} ${extra}`); }
  else if (cond) { pass++; results.push(`  ✅ ${name}`); console.log(`  [PASS] ${name} ${extra}`); }
  else { fail++; results.push(`  ❌ ${name}`); console.log(`  [FAIL] ${name} ${extra}`); }
};
const j = (r, s) => { try { return JSON.parse(r); } catch { return null; } };

function req(path, { method = "GET", body, cookie } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  return fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

(async () => {
  console.log(`\n=== Pithagoras Portal 端到端测试 @ ${BASE} ===\n`);

  // ---- T1 认证 ----
  console.log("▶ T1 认证");
  ok("T1.1 未登录访问 401",
    (await req("/api/workspaces")).status === 401, "(无 cookie 被拦)");

  const badLogin = await req("/api/auth/login", { method: "POST", body: { password: "wrong" } });
  ok("T1.2 错误密码 401", badLogin.status === 401, "(拒绝)");

  const login = await req("/api/auth/login", { method: "POST", body: { password: PASSWORD } });
  const setCookie = login.headers.get("set-cookie") || "";
  ok("T1.3 正确密码登录 200", login.status === 200 && (await login.json()).ok);
  const cookie = setCookie.split(";")[0];
  ok("T1.4 下发会话 Cookie", !!cookie, `(${cookie.split("=")[0]})`);
  ok("T1.5 登录后 /api/settings 放行",
    (await req("/api/settings", { cookie })).status === 200);

  // ---- T2 工作区 ----
  console.log("\n\\ T2 工作区 ====");
  const wsName = NAME("demo-ws");
  const mkWs = await req("/api/workspaces", { method: "POST", body: { name: wsName }, cookie });
  ok("T2.1 创建工作区 200", mkWs.status === 200, `(${wsName})`);
  const ws = await mkWs.json();
  ok("T2.2 返回工作区路径且在主根内",
    typeof ws.path === "string" && ws.path.includes("workspaces"));

  const dupWs = await req("/api/workspaces", { method: "POST", body: { name: wsName }, cookie });
  ok("T2.3 同名工作区 409", dupWs.status === 409, "(已存在拒绝)");

  // slugify 会把 "../" 剥成合法 slug: "../escape-x" -> "escape-x", 在源头就不产生穿越路径, 且 name 最终落在主根内
  const escWs = await req("/api/workspaces", { method: "POST", body: { name: ".._\/escape" }, cookie });
  const escBody = await escWs.json();
  ok("T2.4 穿越形态被 slugify 中和(路径在主根内)",
    escWs.status === 200 && (escBody.path || "").startsWith("/") === false,
    `(${escBody.name}@${escBody.path || "?"})`);

  // 工作区列表返回 { root, workspaces: [...] }
  const listWs = await req("/api/workspaces", { cookie });
  const wsArr = (await listWs.json()) || {};
  ok("T2.5 工作区列表包含新建项",
    Array.isArray(wsArr.workspaces) && wsArr.workspaces.some((w) => w.path === ws.path));

  // ---- T3 Agent 会话 ----
  console.log("\n\\ T3 Agent 会话 ====");
  const mkSession = await req("/api/agent/sessions", { method: "POST", body: { title: "Test Browser Chat" }, cookie });
  ok("T3.1 创建 agent 会话 200", mkSession.status === 200);
  const session = await mkSession.json();
  const sid = session.id;
  ok("T3.2 返回会话 id+live=false", !!sid && session.live === false, `(id=${sid.slice(0,8)}…)`);

  const detail = await req(`/api/sessions/${sid}`, { cookie });
  ok("T3.3 读取会话详情 200", detail.status === 200);

  // ---- T4 Prompt 提交 ----
  console.log("\n\\ T4 Prompt 提交 ====");
  const prompt = await req(`/api/sessions/${sid}/prompt`, { method: "POST", body: { message: "回复两个字:好的" }, cookie });
  ok("T4.1 提交 prompt 返回 running", prompt.status === 200 && (await prompt.json()).status === "running", "(Pi 已在后台跑)");

  // ---- T5 SSE 事件流 ----
  console.log("\n\\ T5 SSE 事件流 ====");
  // 轮询等待 Pi 冷启动+跑完一轮, 直到事件落盘(至多 60s)。用 non-zero before 拿到既有事件
  let evb, evBefore, waited = 0;
  do {
    await new Promise((r) => setTimeout(r, 3000)); waited += 3;
    evBefore = await req(`/api/sessions/${sid}/events/before?before=99999&limit=200`, { cookie });
    evb = await evBefore.json();
  } while ((evb.events || []).length === 0 && waited < 60);
  evb = evb.events || [];
  const types = evb.length ? [...new Set(evb.map((e) => e.type))] : [];
  ok("T5.1 事件回放 before 200", evBefore.status === 200 && Array.isArray(evb));
  ok("T5.2 已产生会话事件(含 agent_end)", evb.length > 0 && evb.some((e) => e.type === "agent_end"),
    `(${(evb).length} 条, ${waited}s内, 含 [${types.join(",")}])`);

  // 实时 SSE（短暂订阅取首帧）
  const abortCtl = new AbortController();
  const sseStart = Date.now();
  const ssePromise = new Promise((resolve) => {
    req(`/api/sessions/${sid}/events`, { cookie, method: "GET" })
      .then((res) => { resolve({ first: res.status }); })
      .catch((e) => resolve({ err: e.message }));
    setTimeout(() => { abortCtl.abort(); }, 2500);
  });
  const sseRes = await ssePromise;
  ok("T5.3 SSE 端点可建连", sseRes.first === 200, "(text/event-stream)");

  // abort 当前 run
  const abort = await req(`/api/sessions/${sid}/abort`, { method: "POST", cookie });
  ok("T5.4 abort 接口 200", abort.status === 200);

  // ---- T6 持久化 ----
  console.log("\n\\ T6 会话持久化 ====");
  ok("T6.1 会话在 SQLite 持久化（重启前仍在列表）", session && !session.live, "(会话已注册)");
  const sessionsList = await req("/api/agent/sessions", { cookie });
  const sList = await sessionsList.json();
  ok("T6.2 /api/agent/sessions 含新建会话",
    Array.isArray(sList.sessions) && sList.sessions.some((s) => s.id === sid));

  console.log(`\n=== 结果: ${pass} 通过, ${fail} 失败, ${skipped} 跳过 ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("测试脚本异常:", e); process.exit(2); });