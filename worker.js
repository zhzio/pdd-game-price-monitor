const GAMES = [
  {
    id: "totk-ns2",
    name: "塞尔达传说 王国之泪",
    short: "王国之泪",
    target: 280,
    queries: [
      "王国之泪",
      "塞尔达王国之泪",
      "塞尔达传说 王国之泪"
    ]
  },
  {
    id: "kiseki-2nd-ns2",
    name: "空之轨迹 the 2nd",
    short: "空轨2nd",
    target: 400,
    queries: [
      "空之轨迹",
      "空之轨迹2nd",
      "空轨2nd"
    ]
  }
];

function norm(v = "") {
  return String(v)
    .toLowerCase()
    .replace(/\s+/g, "")
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
      t.includes("空之轨迹2") ||
      t.includes("空之軌跡2") ||
      t.includes("空轨2") ||
      t.includes("空軌2");

    return name && second;
  }

  return false;
}

async function md5Upper(text) {
  const data =
    new TextEncoder().encode(text);

  const digest =
    await crypto.subtle.digest(
      "MD5",
      data
    );

  return [...new Uint8Array(digest)]
    .map(
      b =>
        b.toString(16)
          .padStart(2, "0")
    )
    .join("")
    .toUpperCase();
}

async function sign(params, secret) {
  let source = secret;

  for (
    const key
    of Object.keys(params).sort()
  ) {
    source +=
      key +
      params[key];
  }

  source += secret;

  return md5Upper(source);
}

async function pddCall(env, extra) {
  if (!env.PDD_CLIENT_ID)
    throw new Error("缺 PDD_CLIENT_ID");

  if (!env.PDD_CLIENT_SECRET)
    throw new Error("缺 PDD_CLIENT_SECRET");

  if (!env.PDD_PID)
    throw new Error("缺 PDD_PID");

  const params = {
    client_id:
      env.PDD_CLIENT_ID,

    timestamp:
      String(
        Math.floor(Date.now() / 1000)
      ),

    data_type:
      "JSON",

    version:
      "V1",

    ...extra
  };

  params.sign =
    await sign(
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
      e.sub_msg ||
      e.error_msg ||
      "PDD API error"
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

    goodsSign:
      g.goods_sign || null,

    price,

    afterCouponPrice:
      price === null
        ? null
        : Math.max(
            0,
            price - coupon
          ),

    activityTags:
      g.activity_tags || [],

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

        // 百亿补贴
        activity_tags:
          JSON.stringify([7]),

        page:
          "1",

        page_size:
          "20"
      }
    );

  const response =
    data.goods_search_response ||
    {};

  return Array.isArray(
    response.goods_list
  )
    ? response.goods_list.map(
        simplify
      )
    : [];
}

async function scanGame(
  env,
  game
) {
  const map =
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
        const id =
          item.goodsSign ||
          `${item.goodsName}|${item.price}`;

        map.set(
          id,
          item
        );
      }

    } catch (e) {
      errors.push({
        query,
        error:
          String(
            e?.message || e
          )
      });
    }
  }

  const raw =
    [...map.values()];

  const valid =
    raw.filter(
      item => {
        const price =
          item.afterCouponPrice ??
          item.price;

        return (
          matchesGame(
            game,
            item.goodsName || ""
          ) &&
          isNS2(
            item.goodsName || ""
          ) &&
          typeof price === "number" &&
          price > 0
        );
      }
    );

  valid.sort(
    (a, b) =>
      (
        a.afterCouponPrice ??
        a.price
      ) -
      (
        b.afterCouponPrice ??
        b.price
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
      "百亿补贴-DDK",

    rawCount:
      raw.length,

    eligibleCount:
      valid.length,

    best:
      valid[0] || null,

    rawCandidates:
      raw.slice(0, 10),

    errors
  };
}

async function scanAll(env) {
  const result = [];

  for (
    const game
    of GAMES
  ) {
    result.push(
      await scanGame(
        env,
        game
      )
    );
  }

  return result;
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
    typeof v !== "number"
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

async function bark(
  env,
  title,
  body
) {
  if (!env.BARK_KEY)
    throw new Error("缺 BARK_KEY");

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
    `${encodeURIComponent(body)}`;

  const r =
    await fetch(url);

  if (!r.ok) {
    throw new Error(
      `Bark ${r.status}`
    );
  }
}

async function getState(
  env,
  id
) {
  const raw =
    await env.PRICE_STATE.get(
      `game:${id}`
    );

  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveState(
  env,
  id,
  state
) {
  await env.PRICE_STATE.put(
    `game:${id}`,
    JSON.stringify(state)
  );
}

function bjTime(date) {
  const d =
    new Date(
      date.getTime() +
      8 * 3600000
    );

  return {
    date:
      d.toISOString()
        .slice(0, 10),

    hour:
      d.getUTCHours(),

    minute:
      d.getUTCMinutes()
  };
}

async function monitor(
  env,
  date
) {
  const scans =
    await scanAll(env);

  const states =
    {};

  for (
    const scan
    of scans
  ) {
    const old =
      await getState(
        env,
        scan.id
      );

    const price =
      priceOf(scan);

    let below =
      Boolean(
        old.belowTarget
      );

    const oldLow =
      typeof old.historicalLow === "number"
        ? old.historicalLow
        : null;

    const low =
      typeof price === "number"
        ? (
            oldLow === null
              ? price
              : Math.min(
                  price,
                  oldLow
                )
          )
        : oldLow;

    if (
      typeof price === "number" &&
      price <= scan.target &&
      !below
    ) {
      await bark(
        env,

        "🎯 百亿补贴到目标价",

        `${scan.name} NS2\n` +
        `最低：${money(price)}\n` +
        `目标：≤ ${money(scan.target)}`
      );

      below =
        true;
    }

    if (
      typeof price !== "number" ||
      price > scan.target
    ) {
      below =
        false;
    }

    const state = {
      lastPrice:
        price,

      historicalLow:
        low,

      belowTarget:
        below,

      lastGoodsName:
        scan.best?.goodsName ||
        null,

      updatedAt:
        new Date()
          .toISOString()
    };

    await saveState(
      env,
      scan.id,
      state
    );

    states[
      scan.id
    ] =
      state;
  }

  const bj =
    bjTime(date);

  if (
    bj.hour === 8 &&
    bj.minute <= 20
  ) {
    const meta =
      "meta:lastDailyReportDate";

    const last =
      await env.PRICE_STATE.get(
        meta
      );

    if (
      last !== bj.date
    ) {
      const lines =
        scans.map(
          scan => {
            const p =
              priceOf(scan);

            return (
              `${scan.short} NS2：` +
              `${money(p)} ｜ ` +
              `目标 ${money(scan.target)}`
            );
          }
        );

      await bark(
        env,
        "☀️ 08:00 游戏价格晨报",
        lines.join("\n")
      );

      await env.PRICE_STATE.put(
        meta,
        bj.date
      );
    }
  }

  return {
    scans,
    states
  };
}


/*
 * --------------------------
 * Browser Run 消费者端测试
 * --------------------------
 */

function htmlToVisibleText(html) {
  return html
    .replace(
      /<script[\s\S]*?<\/script>/gi,
      " "
    )
    .replace(
      /<style[\s\S]*?<\/style>/gi,
      " "
    )
    .replace(
      /<[^>]+>/g,
      "\n"
    )
    .replace(
      /&nbsp;/gi,
      " "
    )
    .replace(
      /&amp;/gi,
      "&"
    )
    .replace(
      /&lt;/gi,
      "<"
    )
    .replace(
      /&gt;/gi,
      ">"
    )
    .replace(
      /\n\s*\n+/g,
      "\n"
    )
    .trim();
}

function contexts(
  text,
  word,
  max = 8
) {
  const result = [];

  let from =
    0;

  const lower =
    text.toLowerCase();

  const needle =
    word.toLowerCase();

  while (
    result.length < max
  ) {
    const i =
      lower.indexOf(
        needle,
        from
      );

    if (i === -1)
      break;

    result.push(
      text.slice(
        Math.max(
          0,
          i - 180
        ),
        Math.min(
          text.length,
          i + 500
        )
      )
    );

    from =
      i +
      needle.length;
  }

  return result;
}

async function browserTest(
  env,
  query
) {
  if (!env.BROWSER) {
    throw new Error(
      "BROWSER binding 未生效"
    );
  }

  const target =
    "https://mobile.yangkeduo.com/search_result.html" +
    `?search_key=${encodeURIComponent(query)}` +
    "&search_type=goods&source=index";

  const response =
    await env.BROWSER.quickAction(
      "content",
      {
        url:
          target,

        /*
         * 等动态请求基本结束
         */
        gotoOptions: {
          waitUntil:
            "networkidle2"
        },

        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) " +
          "AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
      }
    );

  const html =
    await response.text();

  const visible =
    htmlToVisibleText(
      html
    );

  return {
    ok: true,

    query,

    target,

    browserMsUsed:
      response.headers.get(
        "X-Browser-Ms-Used"
      ),

    htmlLength:
      html.length,

    visibleTextLength:
      visible.length,

    signals: {
      query:
        visible.includes(
          query
        ),

      百亿补贴:
        visible.includes(
          "百亿补贴"
        ),

      switch2:
        /switch\s*2/i
          .test(visible),

      ns2:
        /ns2/i
          .test(visible),

      captcha:
        /验证码|captcha|验证访问/i
          .test(visible),

      risk:
        /访问受限|异常访问|风险/i
          .test(visible)
    },

    /*
     * 优先看这些片段
     */
    queryContexts:
      contexts(
        visible,
        query
      ),

    subsidyContexts:
      contexts(
        visible,
        "百亿补贴"
      ),

    switchContexts: [
      ...contexts(
        visible,
        "Switch2",
        5
      ),

      ...contexts(
        visible,
        "NS2",
        5
      )
    ].slice(0, 10),

    /*
     * 如果上面都空，
     * 这个样本可以判断页面到底渲染了什么
     */
    visibleSample:
      visible.slice(
        0,
        7000
      )
  };
}


function json(
  value,
  status = 200
) {
  return new Response(
    JSON.stringify(
      value,
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
          `
          <!doctype html>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width,initial-scale=1">
          <title>游戏价格雷达</title>
          <body style="font-family:-apple-system;padding:30px;max-width:700px;margin:auto">
            <h1>游戏价格雷达</h1>
            <p>百亿补贴价格监控测试中。</p>
            <p>王国之泪 NS2：≤ ¥280</p>
            <p>空轨2nd NS2：≤ ¥400</p>
          </body>
          `,
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

          browser:
            Boolean(
              env.BROWSER
            ),

          kv:
            Boolean(
              env.PRICE_STATE
            ),

          bark:
            Boolean(
              env.BARK_KEY
            )
        });
      }

      if (
        url.pathname ===
        "/scan"
      ) {
        return json({
          ok: true,

          scans:
            await scanAll(
              env
            )
        });
      }

      /*
       * 真浏览器消费者端测试
       */
      if (
        url.pathname ===
        "/browser-test"
      ) {
        const q =
          (
            url.searchParams
              .get("q") ||
            "王国之泪 Switch2"
          ).trim();

        return json(
          await browserTest(
            env,
            q
          )
        );
      }

      if (
        url.pathname ===
        "/status"
      ) {
        const states = {};

        for (
          const game
          of GAMES
        ) {
          states[
            game.id
          ] =
            await getState(
              env,
              game.id
            );
        }

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

    } catch (e) {
      return json(
        {
          ok: false,

          error:
            String(
              e?.message || e
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
      monitor(
        env,
        new Date(
          event.scheduledTime
        )
      )
      .catch(
        e =>
          console.error(e)
      )
    );
  }
};
