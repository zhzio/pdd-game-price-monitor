const GAMES = [
  {
    id: "totk-ns2",
    name: "塞尔达传说 王国之泪",
    short: "王国之泪",
    target: 280,
    queries: [
      "塞尔达传说 王国之泪 Switch2",
      "王国之泪 NS2",
      "王国之泪 Switch 2"
    ]
  },
  {
    id: "kiseki-2nd-ns2",
    name: "空之轨迹 the 2nd",
    short: "空轨2nd",
    target: 400,
    queries: [
      "空之轨迹 the 2nd Switch2",
      "空轨2nd NS2",
      "空之轨迹2nd Switch 2"
    ]
  }
];

function norm(v = "") {
  return String(v)
    .toLowerCase()
    .replace(/[　\s]+/g, "")
    .replace(/[·•・:：\-—_()（）【】[\]\/\\]/g, "");
}

function isNS2(title) {
  const t = norm(title);

  return (
    t.includes("switch2") ||
    t.includes("ns2") ||
    t.includes("nintendoswitch2") ||
    t.includes("switch二") ||
    t.includes("switchⅡ")
  );
}

function matchesGame(game, title) {
  const t = norm(title);

  if (game.id === "totk-ns2") {
    return (
      t.includes("王国之泪") ||
      t.includes("王國之淚")
    );
  }

  if (game.id === "kiseki-2nd-ns2") {
    const name =
      t.includes("空之轨迹") ||
      t.includes("空之軌跡") ||
      t.includes("空轨") ||
      t.includes("空軌");

    const second =
      t.includes("2nd") ||
      t.includes("第二部") ||
      t.includes("空之轨迹2") ||
      t.includes("空之軌跡2") ||
      t.includes("空轨2") ||
      t.includes("空軌2");

    return name && second;
  }

  return false;
}

async function md5Upper(text) {
  const bytes =
    new TextEncoder().encode(text);

  const hash =
    await crypto.subtle.digest(
      "MD5",
      bytes
    );

  return [...new Uint8Array(hash)]
    .map(
      b =>
        b.toString(16)
          .padStart(2, "0")
    )
    .join("")
    .toUpperCase();
}

async function createSign(
  params,
  secret
) {
  const keys =
    Object.keys(params).sort();

  let source =
    secret;

  for (const key of keys) {
    source +=
      key +
      params[key];
  }

  source +=
    secret;

  return md5Upper(source);
}

async function pddCall(
  env,
  extra
) {
  if (!env.PDD_CLIENT_ID) {
    throw new Error(
      "未设置 PDD_CLIENT_ID"
    );
  }

  if (!env.PDD_CLIENT_SECRET) {
    throw new Error(
      "未设置 PDD_CLIENT_SECRET"
    );
  }

  if (!env.PDD_PID) {
    throw new Error(
      "未设置 PDD_PID"
    );
  }

  const params = {
    client_id:
      env.PDD_CLIENT_ID,

    timestamp:
      String(
        Math.floor(
          Date.now() / 1000
        )
      ),

    data_type:
      "JSON",

    version:
      "V1",

    ...extra
  };

  params.sign =
    await createSign(
      params,
      env.PDD_CLIENT_SECRET
    );

  const body =
    new URLSearchParams();

  for (
    const [key, value]
    of Object.entries(params)
  ) {
    body.set(
      key,
      String(value)
    );
  }

  const response =
    await fetch(
      "https://gw-api.pinduoduo.com/api/router",
      {
        method: "POST",

        headers: {
          "content-type":
            "application/x-www-form-urlencoded;charset=UTF-8"
        },

        body:
          body.toString()
      }
    );

  const buffer =
    await response.arrayBuffer();

  const text =
    new TextDecoder("utf-8")
      .decode(buffer);

  const data =
    JSON.parse(text);

  if (data.error_response) {
    const e =
      data.error_response;

    throw new Error(
      `PDD API ${e.error_code || ""}/${e.sub_code || ""}: ` +
      `${e.sub_msg || e.error_msg || "未知错误"}`
    );
  }

  return data;
}

function simplify(g) {
  const price =
    typeof g.min_group_price === "number"
      ? g.min_group_price / 100
      : null;

  const coupon =
    typeof g.coupon_discount === "number"
      ? g.coupon_discount / 100
      : 0;

  return {
    goodsName:
      g.goods_name || null,

    mallName:
      g.mall_name || null,

    goodsSign:
      g.goods_sign || null,

    price,

    couponDiscount:
      coupon,

    afterCouponPrice:
      price !== null
        ? Math.max(
            0,
            price - coupon
          )
        : null,

    sales:
      g.sales_tip ??
      g.sold_quantity ??
      null,

    activityTags:
      Array.isArray(
        g.activity_tags
      )
        ? g.activity_tags
        : [],

    image:
      g.goods_thumbnail_url ||
      g.goods_image_url ||
      null
  };
}

async function searchKeyword(
  env,
  keyword
) {
  const data =
    await pddCall(
      env,
      {
        type:
          "pdd.ddk.goods.search",

        keyword,

        pid:
          env.PDD_PID,

        // 只搜索百亿补贴
        activity_tags:
          JSON.stringify([7]),

        page:
          "1",

        page_size:
          "20"
      }
    );

  const result =
    data.goods_search_response ||
    {};

  const list =
    Array.isArray(
      result.goods_list
    )
      ? result.goods_list
      : [];

  return list.map(
    simplify
  );
}

function eligible(
  game,
  item
) {
  const title =
    item.goodsName || "";

  const price =
    item.afterCouponPrice ??
    item.price;

  return (
    matchesGame(game, title) &&
    isNS2(title) &&
    typeof price === "number" &&
    Number.isFinite(price) &&
    price > 0
  );
}

async function scanGame(
  env,
  game
) {
  const items =
    new Map();

  const errors =
    [];

  for (
    const query
    of game.queries
  ) {
    try {
      const list =
        await searchKeyword(
          env,
          query
        );

      for (
        const item
        of list
      ) {
        const key =
          item.goodsSign ||
          `${item.goodsName}|${item.price}`;

        if (!items.has(key)) {
          items.set(
            key,
            item
          );
        }
      }

    } catch (error) {
      errors.push({
        query,

        error:
          String(
            error?.message ||
            error
          )
      });
    }
  }

  const rawCandidates =
    [...items.values()];

  const matches =
    rawCandidates
      .filter(
        item =>
          eligible(
            game,
            item
          )
      )
      .sort(
        (a, b) =>
          (
            a.afterCouponPrice ??
            a.price ??
            Infinity
          ) -
          (
            b.afterCouponPrice ??
            b.price ??
            Infinity
          )
      );

  return {
    id:
      game.id,

    name:
      game.name,

    short:
      game.short,

    version:
      "NS2",

    target:
      game.target,

    source:
      "百亿补贴",

    rawCount:
      rawCandidates.length,

    eligibleCount:
      matches.length,

    best:
      matches[0] ||
      null,

    topMatches:
      matches.slice(0, 5),

    // 调试用：能看到百补API到底返回了什么
    rawCandidates:
      rawCandidates.slice(0, 10),

    errors
  };
}

async function scanAll(env) {
  const scans =
    [];

  for (
    const game
    of GAMES
  ) {
    scans.push(
      await scanGame(
        env,
        game
      )
    );
  }

  return scans;
}

function priceOf(scan) {
  return (
    scan?.best?.afterCouponPrice ??
    scan?.best?.price ??
    null
  );
}

function money(v) {
  if (
    typeof v !== "number" ||
    !Number.isFinite(v)
  ) {
    return "—";
  }

  return (
    "¥" +
    (
      Number.isInteger(v)
        ? v
        : v.toFixed(2)
    )
  );
}

function beijingTime(date) {
  const shifted =
    new Date(
      date.getTime() +
      8 * 60 * 60 * 1000
    );

  return {
    date:
      shifted
        .toISOString()
        .slice(0, 10),

    hour:
      shifted
        .getUTCHours(),

    minute:
      shifted
        .getUTCMinutes(),

    iso:
      shifted
        .toISOString()
        .replace(
          "Z",
          "+08:00"
        )
  };
}

async function bark(
  env,
  title,
  body
) {
  if (!env.BARK_KEY) {
    throw new Error(
      "未设置 BARK_KEY"
    );
  }

  const key =
    String(
      env.BARK_KEY
    ).trim();

  const base =
    key.startsWith("http")
      ? key.replace(
          /\/+$/,
          ""
        )
      : `https://api.day.app/${key}`;

  const url =
    `${base}/` +
    `${encodeURIComponent(title)}/` +
    `${encodeURIComponent(body)}` +
    `?group=${encodeURIComponent("游戏卡带价格雷达")}`;

  const response =
    await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Bark 推送失败：${response.status}`
    );
  }
}

async function readState(
  env,
  id
) {
  const raw =
    await env.PRICE_STATE.get(
      `game:${id}`
    );

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeState(
  env,
  id,
  state
) {
  await env.PRICE_STATE.put(
    `game:${id}`,
    JSON.stringify(state)
  );
}

async function processPrices(
  env,
  scans
) {
  const states =
    {};

  for (
    const scan
    of scans
  ) {
    const previous =
      await readState(
        env,
        scan.id
      );

    const price =
      priceOf(scan);

    let belowTarget =
      Boolean(
        previous.belowTarget
      );

    const oldLow =
      typeof previous.historicalLow === "number"
        ? previous.historicalLow
        : null;

    const historicalLow =
      typeof price === "number"
        ? (
            oldLow === null
              ? price
              : Math.min(
                  oldLow,
                  price
                )
          )
        : oldLow;

    if (
      typeof price === "number" &&
      price <= scan.target &&
      !belowTarget
    ) {
      try {
        await bark(
          env,

          "🎯 百亿补贴到目标价",

          `${scan.name} NS2\n` +
          `当前最低：${money(price)}\n` +
          `目标价：≤ ${money(scan.target)}\n` +
          `${scan.best?.goodsName || ""}`
        );

        belowTarget =
          true;

      } catch (error) {
        console.error(
          "Bark failed",
          error
        );

        belowTarget =
          false;
      }
    }

    // 涨价、消失，都重新解锁下一次提醒
    if (
      typeof price !== "number" ||
      price > scan.target
    ) {
      belowTarget =
        false;
    }

    const next = {
      lastPrice:
        price,

      historicalLow,

      belowTarget,

      lastGoodsSign:
        scan.best?.goodsSign ||
        null,

      lastGoodsName:
        scan.best?.goodsName ||
        null,

      updatedAt:
        new Date()
          .toISOString()
    };

    await writeState(
      env,
      scan.id,
      next
    );

    states[
      scan.id
    ] =
      next;
  }

  return states;
}

async function morningReport(
  env,
  scans,
  states,
  scheduledDate
) {
  const bj =
    beijingTime(
      scheduledDate
    );

  if (
    bj.hour !== 8 ||
    bj.minute > 20
  ) {
    return false;
  }

  const metaKey =
    "meta:lastDailyReportDate";

  const last =
    await env.PRICE_STATE.get(
      metaKey
    );

  if (
    last === bj.date
  ) {
    return false;
  }

  const lines =
    scans.map(
      scan => {
        const price =
          priceOf(scan);

        const state =
          states[
            scan.id
          ] || {};

        if (
          typeof price !== "number"
        ) {
          return (
            `${scan.short} NS2：` +
            `百亿补贴暂无匹配 ｜ ` +
            `目标 ${money(scan.target)}`
          );
        }

        const hit =
          price <= scan.target
            ? " ✅"
            : "";

        const low =
          typeof state.historicalLow === "number"
            ? ` ｜ 历史低 ${money(state.historicalLow)}`
            : "";

        return (
          `${scan.short} NS2：` +
          `${money(price)} ｜ ` +
          `目标 ${money(scan.target)}` +
          `${hit}${low}`
        );
      }
    );

  await bark(
    env,

    "☀️ 08:00 百亿补贴游戏晨报",

    lines.join("\n")
  );

  await env.PRICE_STATE.put(
    metaKey,
    bj.date
  );

  return true;
}

async function runMonitor(
  env,
  scheduledDate
) {
  if (!env.PRICE_STATE) {
    throw new Error(
      "PRICE_STATE KV 未绑定"
    );
  }

  const scans =
    await scanAll(env);

  const states =
    await processPrices(
      env,
      scans
    );

  const morning =
    await morningReport(
      env,
      scans,
      states,
      scheduledDate
    );

  return {
    ok: true,
    scans,
    states,
    morning
  };
}

function json(
  data,
  status = 200
) {
  return new Response(
    JSON.stringify(
      data,
      null,
      2
    ),
    {
      status,

      headers: {
        "content-type":
          "application/json; charset=utf-8",

        "cache-control":
          "no-store"
      }
    }
  );
}

function homepage() {
  return `
<!doctype html>
<html lang="zh-CN">

<head>
<meta charset="utf-8">
<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>
游戏卡带价格雷达
</title>

<style>
body {
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;

  background: #f6f7f9;
  color: #111827;
  margin: 0;
  padding: 24px;
}

.card {
  max-width: 680px;
  margin: 60px auto;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 24px;
  padding: 30px;
}

.badge {
  display: inline-block;
  background: #fff1f2;
  color: #e11d48;
  border-radius: 999px;
  padding: 6px 12px;
  font-weight: 600;
}

.game {
  margin-top: 14px;
  padding: 16px;
  background: #fafafa;
  border-radius: 16px;
}
</style>

</head>

<body>

<main class="card">

<span class="badge">
百亿补贴监控中
</span>

<h1>
游戏卡带价格雷达
</h1>

<p>
每10分钟检查百亿补贴商品；
达到目标价立即 Bark；
每天北京时间08:00发送晨报。
</p>

<div class="game">
<strong>王国之泪 NS2</strong>
<br>
目标价 ≤ ¥280
</div>

<div class="game">
<strong>空之轨迹 the 2nd NS2</strong>
<br>
目标价 ≤ ¥400
</div>

</main>

</body>
</html>
`;
}

export default {

  async fetch(
    request,
    env
  ) {
    try {
      const url =
        new URL(
          request.url
        );

      if (
        url.pathname === "/"
      ) {
        return new Response(
          homepage(),
          {
            headers: {
              "content-type":
                "text/html; charset=utf-8"
            }
          }
        );
      }

      if (
        url.pathname ===
        "/health"
      ) {
        return json({
          ok: true,

          pddClientId:
            Boolean(
              env.PDD_CLIENT_ID
            ),

          pddClientSecret:
            Boolean(
              env.PDD_CLIENT_SECRET
            ),

          pddPid:
            Boolean(
              env.PDD_PID
            ),

          bark:
            Boolean(
              env.BARK_KEY
            ),

          kv:
            Boolean(
              env.PRICE_STATE
            ),

          mode:
            "百亿补贴",

          beijingTime:
            beijingTime(
              new Date()
            ).iso
        });
      }

      // 手动测试，不发 Bark、不写 KV
      if (
        url.pathname ===
        "/scan"
      ) {
        return json({
          ok: true,

          mode:
            "百亿补贴",

          scans:
            await scanAll(
              env
            )
        });
      }

      if (
        url.pathname ===
        "/status"
      ) {
        const states =
          {};

        for (
          const game
          of GAMES
        ) {
          states[
            game.id
          ] =
            await readState(
              env,
              game.id
            );
        }

        states.lastDailyReportDate =
          await env.PRICE_STATE.get(
            "meta:lastDailyReportDate"
          );

        return json({
          ok: true,
          states
        });
      }

      return new Response(
        "Not Found",
        {
          status: 404
        }
      );

    } catch (error) {

      return json(
        {
          ok: false,

          error:
            String(
              error?.message ||
              error
            )
        },
        500
      );
    }
  },


  async scheduled(
    event,
    env,
    ctx
  ) {
    ctx.waitUntil(
      runMonitor(
        env,
        new Date(
          event.scheduledTime
        )
      )
      .catch(
        error => {
          console.error(
            "Monitor failed:",
            error?.stack ||
            error
          );
        }
      )
    );
  }
};
