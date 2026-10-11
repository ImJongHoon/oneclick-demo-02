// OneClick 시연 앱 (compose + DB): 방문할 때마다 Postgres에 기록하고 총 방문 수를 보여 준다.
// 재배포·롤백해도 숫자가 이어지면 "데이터 보존 + 무중단 교체"가 동작하는 것이다.
// 시나리오 브랜치는 아래 VERSION·COLOR 또는 compose 설정만 바꾼다.
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const { Worker } = require("node:worker_threads");
const { Pool } = require("pg");

const VERSION = "v5";
const COLOR = "#d70015";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// DB가 앱보다 늦게 뜰 수 있으므로 연결될 때까지 기다리고, 테이블은 앱이 시작할 때 직접 만든다 (마이그레이션)
async function prepareDatabase() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await pool.query("CREATE TABLE IF NOT EXISTS visits (id SERIAL PRIMARY KEY, version TEXT NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now())");
      console.log("database ready");
      return;
    } catch (error) {
      console.log(`waiting for database (${attempt}/30): ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  throw new Error("database did not become ready");
}

// 시연용 부하 (서버 자원 시각화): 20초 동안 CPU 코어마다 계산 + 메모리 300MB를 잡는다.
// 계산은 워커 스레드에서 해서 앱은 계속 응답한다 (감시 루프가 장애로 오판하지 않게)
const LOAD_MS = 20_000;
const BURN = "const end = Date.now() + require('node:worker_threads').workerData; while (Date.now() < end) Math.sqrt(Math.random());";
let loadUntil = 0;
let ballast = null;

function startLoad() {
  if (loadUntil > Date.now()) return;
  loadUntil = Date.now() + LOAD_MS;
  ballast = Buffer.alloc(300 * 1024 * 1024, 1);
  for (let i = 0; i < os.availableParallelism(); i += 1) new Worker(BURN, { eval: true, workerData: LOAD_MS });
  setTimeout(() => {
    ballast = null;
  }, LOAD_MS);
  console.log(`load started: ${os.availableParallelism()} workers, 300MB for ${LOAD_MS / 1000}s`);
}

/** REDIS_URL이 있으면 캐시 서버에 닿는지만 확인한다 (의존성 없이 TCP 연결) */
function cacheStatus() {
  if (!process.env.REDIS_URL) return Promise.resolve("없음");
  const { hostname, port } = new URL(process.env.REDIS_URL);
  return new Promise((resolve) => {
    const socket = net.connect({ host: hostname, port: Number(port) || 6379, timeout: 1_000 });
    const done = (status) => {
      socket.destroy();
      resolve(status);
    };
    socket.once("connect", () => done("연결됨"));
    socket.once("timeout", () => done("응답 없음"));
    socket.once("error", () => done("연결 실패"));
  });
}

const page = ({ count, cache }) => `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>OneClick compose demo ${VERSION}</title></head>
<body style="margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:${COLOR};color:#fff;font-family:system-ui,sans-serif">
  <h1 style="font-size:96px;margin:0">${count}</h1>
  <p style="font-size:20px;opacity:.85">총 방문 수 · ${VERSION} · ${os.hostname()}</p>
  <p style="font-size:16px;opacity:.75">캐시(Redis): ${cache} · API_KEY: ${process.env.API_KEY ? "설정됨" : "없음"}</p>
  <form method="post" action="/load" style="margin-top:24px">
    <button style="font-size:18px;padding:12px 24px;border:0;border-radius:999px;background:#fff;color:${COLOR};cursor:pointer">
      ${loadUntil > Date.now() ? `부하 주는 중… (${Math.ceil((loadUntil - Date.now()) / 1000)}초 남음)` : "부하 주기 (20초)"}
    </button>
  </form>
</body>
</html>`;

const server = http.createServer(async (request, response) => {
  try {
    if (request.url === "/favicon.ico") return response.writeHead(204).end();
    if (request.method === "POST" && request.url === "/load") {
      startLoad();
      return response.writeHead(303, { Location: "/" }).end();
    }
    await pool.query("INSERT INTO visits (version) VALUES ($1)", [VERSION]);
    const { rows } = await pool.query("SELECT count(*)::int AS count FROM visits");
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "X-App-Version": VERSION, "Cache-Control": "no-store" });
    response.end(page({ count: rows[0].count, cache: await cacheStatus() }));
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`database error: ${error.message}`);
  }
});

const port = Number(process.env.PORT) || 3000;
prepareDatabase()
  .then(() => server.listen(port, () => console.log(`compose demo ${VERSION} listening on ${port}`)))
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });

// docker stop(SIGTERM)을 받으면 처리 중인 요청을 마치고 DB 연결을 닫은 뒤 종료
process.on("SIGTERM", () => server.close(() => pool.end().then(() => process.exit(0))));
