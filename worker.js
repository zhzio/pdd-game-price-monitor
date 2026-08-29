const STATE_SCHEMA_VERSION = 2;
const SUBSIDY_ACTIVITY_TAG = 7;
const RECOMMEND_LIMIT = 100;
const RECOMMEND_PAGES = 2;
const DEBUG_CANDIDATE_LIMIT = 20;

const RECOMMEND_PLANS = [
  {
    label: "猜你喜欢-电器",
    channelType: 4,
    catId: 20500
  },
  {
    label: "今日销量榜",
    channelType: 1
  },
  {
    label: "实时热销榜",
    channelType: 5
  }
];

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

const NON_PHYSICAL_WORDS = [
  "下载",
  "数字",
  "数字版",
  "下载版",
  "兑换码",
  "激活码",
  "账号",
  "租号",
  "共享",
  "离线",
  "dlc"
];

function norm(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[·•・:：\-—_()（）【】[\]\/\\]/g, "");
}

function isNS2(title) {
  const text = norm(title);

  return (
    text.includes("switch2") ||
    text.includes("ns2") ||
    text.includes("nintendoswitch2") ||
    text.includes("switch二") ||
    text.includes("switchⅡ")
  );
}

function matchesGame(game, title) {
  const text = norm(title);

  if (game.id === "totk-ns2") {
    return (
      text.includes("王国之泪") ||
      text.includes("王國之淚")
    );
  }

  if (game.id === "kiseki-2nd-ns2") {
    const hasName =
      text.includes("空之轨迹") ||
      text.includes("空之軌跡") ||
      text.includes("空轨") ||
      text.includes("空軌");

    const hasSecondMarker =
      text.includes("2nd") ||
      text.includes("第二部") ||
      text.includes("第二作") ||
      text.includes("第2部") ||
      text.includes("空之轨迹2") ||
      text.includes("空之軌跡2") ||
      text.includes("空轨2") ||
      text.includes("空軌2");

    return hasName && hasSecondMarker;
  }

  return false;
}

function isPhysicalProduct(title) {
  const text = norm(title);
  return !NON_PHYSICAL_WORDS.some(word => text.includes(norm(word)));
}

function hasSubsidyTag(item) {
  return (
    Array.isArray(item.activityTags) &&
    item.activityTags.some(tag => Number(tag) === SUBSIDY_ACTIVITY_TAG)
  );
}

function itemPrice(item) {
  return item?.afterCouponPrice ?? item?.price ?? null;
}

function itemKey(item) {
  return (
    item.goodsSign ||
    `${item.goodsName || ""}|${item.mallName || ""}|${item.price ?? ""}`
  );
}

function mergeItems(items) {
  const result = new Map();

  for (const item of items) {
    const key = itemKey(item);
    const current = result.get(key);

    if (!current) {
      result.set(key, {
        ...item,
        sources: [...new Set(item.sources || [])]
      });
      continue;
    }

    const currentPrice = itemPrice(current);
    const nextPrice = itemPrice(item);
    const preferred =
      typeof nextPrice === "number" &&
      (typeof currentPrice !== "number" || nextPrice < currentPrice)
        ? item
        : current;

    result.set(key, {
      ...preferred,
      sources: [
        ...new Set([
          ...(current.sources || []),
          ...(item.sources || [])
        ])
      ]
    });
  }

  return [...result.values()];
}

async function md5Upper(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("MD5", data);

  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

async function sign(params, secret) {
  let source = secret;

  for (const key of Object.keys(params).sort()) {
    source += key + params[key];
  }

  source += secret;
  return md5Upper(source);
}

async function pddCall(env, extra) {
  if (!env.PDD_CLIENT_ID) throw new Error("缺 PDD_CLIENT_ID");
  if (!env.PDD_CLIENT_SECRET) throw new Error("缺 PDD_CLIENT_SECRET");
  if (!env.PDD_PID) throw new Error("缺 PDD_PID");

  const params = {
    client_id: env.PDD_CLIENT_ID,
    timestamp: String(Math.floor(Date.now() / 1000)),
    data_type: "JSON",
    version: "V1",
    ...extra
  };

  params.sign = await sign(params, env.PDD_CLIENT_SECRET);

  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    body.set(key, String(value));
  }

  const response = await fetch(
    "https://gw-api.pinduoduo.com/api/router",
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: body.toString()
    }
  );

  const buffer = await response.arrayBuffer();
  const text = new TextDecoder("utf-8").decode(buffer);

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`PDD API 返回非 JSON（HTTP ${response.status}）`);
  }

  if (data.error_response) {
    const error = data.error_response;
    const message = error.sub_msg || error.error_msg || "PDD API error";
    const code = error.sub_code || error.error_code;
    throw new Error(code ? `${message} (${code})` : message);
  }

  return data;
}

function simplify(goods, source) {
  const price =
    typeof goods.min_group_price === "number"
      ? goods.min_group_price / 100
      : null;
  const couponDiscount =
    typeof goods.coupon_discount === "number"
      ? goods.coupon_discount / 100
      : 0;

  return {
    goodsName: goods.goods_name || null,
    mallName: goods.mall_name || null,
    goodsSign: goods.goods_sign || null,
    price,
    couponDiscount,
    afterCouponPrice:
      price === null ? null : Math.max(0, price - couponDiscount),
    sales: goods.sales_tip || goods.realtime_sales_tip || null,
    activityTags: Array.isArray(goods.activity_tags)
      ? goods.activity_tags
      : [],
    sources: [source]
  };
}

async function searchKeyword(env, keyword) {
  const data = await pddCall(env, {
    type: "pdd.ddk.goods.search",
    keyword,
    pid: env.PDD_PID,
    activity_tags: JSON.stringify([SUBSIDY_ACTIVITY_TAG]),
    page: "1",
    page_size: "20"
  });

  const list = data.goods_search_response?.goods_list;
  return Array.isArray(list)
    ? list.map(goods => simplify(goods, "search"))
    : [];
}

async function fetchSearchPool(env, game) {
  const items = [];
  const errors = [];

  for (const query of game.queries) {
    try {
      items.push(...await searchKeyword(env, query));
    } catch (error) {
      errors.push({
        query,
        error: String(error?.message || error)
      });
    }
  }

  return {
    items: mergeItems(items),
    errors
  };
}

async function fetchRecommendPool(env) {
  const items = [];
  const errors = [];
  const requests = [];

  for (const plan of RECOMMEND_PLANS) {
    let listId = null;

    for (let page = 0; page < RECOMMEND_PAGES; page += 1) {
      const requestInfo = {
        plan: plan.label,
        channelType: plan.channelType,
        catId: plan.catId || null,
        offset: page * RECOMMEND_LIMIT,
        limit: RECOMMEND_LIMIT
      };

      try {
        const params = {
          type: "pdd.ddk.goods.recommend.get",
          pid: env.PDD_PID,
          channel_type: String(plan.channelType),
          offset: String(page * RECOMMEND_LIMIT),
          limit: String(RECOMMEND_LIMIT)
        };

        if (plan.catId) params.cat_id = String(plan.catId);
        if (listId) params.list_id = listId;

        const data = await pddCall(env, params);
        const response = data.goods_basic_detail_response || {};
        const list = Array.isArray(response.list) ? response.list : [];

        items.push(...list.map(goods => simplify(goods, "recommend")));
        listId = response.list_id || listId;
        requests.push({
          ...requestInfo,
          returned: list.length
        });

        if (list.length < RECOMMEND_LIMIT) break;
      } catch (error) {
        errors.push({
          ...requestInfo,
          error: String(error?.message || error)
        });
        break;
      }
    }
  }

  return {
    items: mergeItems(items),
    errors,
    requests
  };
}

function isEligible(game, item) {
  const price = itemPrice(item);

  return (
    hasSubsidyTag(item) &&
    matchesGame(game, item.goodsName || "") &&
    isNS2(item.goodsName || "") &&
    isPhysicalProduct(item.goodsName || "") &&
    typeof price === "number" &&
    Number.isFinite(price) &&
    price > 0
  );
}

function isDebugCandidate(game, item) {
  const title = item.goodsName || "";
  return hasSubsidyTag(item) && (matchesGame(game, title) || isNS2(title));
}

function stripInternal(item) {
  if (!item) return null;
  const { sources, ...candidate } = item;
  return {
    ...candidate,
    sources
  };
}

function buildScan(game, searchResult, recommendResult) {
  const merged = mergeItems([
    ...searchResult.items,
    ...recommendResult.items
  ]);
  const eligible = merged
    .filter(item => isEligible(game, item))
    .sort((a, b) => itemPrice(a) - itemPrice(b));

  return {
    id: game.id,
    name: game.name,
    short: game.short,
    version: "NS2",
    target: game.target,
    searchRawCount: searchResult.items.length,
    recommendRawCount: recommendResult.items.length,
    mergedCount: merged.length,
    eligibleCount: eligible.length,
    best: stripInternal(eligible[0] || null),
    topMatches: eligible.slice(0, 10).map(stripInternal),
    searchCandidates: searchResult.items
      .filter(item => isDebugCandidate(game, item))
      .slice(0, DEBUG_CANDIDATE_LIMIT)
      .map(stripInternal),
    recommendCandidates: recommendResult.items
      .filter(item => isDebugCandidate(game, item))
      .slice(0, DEBUG_CANDIDATE_LIMIT)
      .map(stripInternal),
    errors: {
      search: searchResult.errors,
      recommend: recommendResult.errors
    }
  };
}

async function scanAll(env) {
  const recommendResult = await fetchRecommendPool(env);
  const scans = [];

  for (const game of GAMES) {
    const searchResult = await fetchSearchPool(env, game);
    scans.push(buildScan(game, searchResult, recommendResult));
  }

  return {
    scans,
    recommendRequests: recommendResult.requests
  };
}

function priceOf(scan) {
  return itemPrice(scan?.best);
}

function money(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `¥${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

async function bark(env, title, body) {
  if (!env.BARK_KEY) throw new Error("缺 BARK_KEY");

  const key = String(env.BARK_KEY).trim();
  const base = key.startsWith("http")
    ? key.replace(/\/+$/, "")
    : `https://api.day.app/${key}`;
  const url =
    `${base}/${encodeURIComponent(title)}/${encodeURIComponent(body)}` +
    `?group=${encodeURIComponent("游戏卡带价格雷达")}`;
  const response = await fetch(url);

  if (!response.ok) throw new Error(`Bark 推送失败：${response.status}`);
}

function freshState() {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    lastPrice: null,
    historicalLow: null,
    belowTarget: false,
    lastGoodsSign: null,
    lastGoodsName: null,
    updatedAt: null,
    lastSeenAt: null,
    missingScans: 0
  };
}

async function getState(env, id) {
  const raw = await env.PRICE_STATE.get(`game:${id}`);
  if (!raw) return freshState();

  try {
    const state = JSON.parse(raw);
    return state?.schemaVersion === STATE_SCHEMA_VERSION
      ? { ...freshState(), ...state }
      : freshState();
  } catch {
    return freshState();
  }
}

async function saveState(env, id, state) {
  await env.PRICE_STATE.put(`game:${id}`, JSON.stringify(state));
}

function beijingTime(date) {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return {
    date: shifted.toISOString().slice(0, 10),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    iso: shifted.toISOString().replace("Z", "+08:00")
  };
}

async function processScan(env, scan, now) {
  const previous = await getState(env, scan.id);
  const price = priceOf(scan);
  let belowTarget = previous.belowTarget;
  let alertError = null;

  if (typeof price === "number" && price <= scan.target && !belowTarget) {
    try {
      await bark(
        env,
        "🎯 百亿补贴到目标价",
        `${scan.name} NS2\n` +
          `当前最低：${money(price)}\n` +
          `目标价：≤ ${money(scan.target)}\n` +
          `${scan.best?.goodsName || ""}`
      );
      belowTarget = true;
    } catch (error) {
      alertError = String(error?.message || error);
    }
  } else if (typeof price === "number" && price > scan.target) {
    belowTarget = false;
  }

  const found = typeof price === "number";
  const state = {
    schemaVersion: STATE_SCHEMA_VERSION,
    lastPrice: found ? price : previous.lastPrice,
    historicalLow: found
      ? (
          typeof previous.historicalLow === "number"
            ? Math.min(previous.historicalLow, price)
            : price
        )
      : previous.historicalLow,
    belowTarget,
    lastGoodsSign: found
      ? scan.best?.goodsSign || null
      : previous.lastGoodsSign,
    lastGoodsName: found
      ? scan.best?.goodsName || null
      : previous.lastGoodsName,
    updatedAt: now.toISOString(),
    lastSeenAt: found ? now.toISOString() : previous.lastSeenAt,
    missingScans: found ? 0 : (previous.missingScans || 0) + 1
  };

  await saveState(env, scan.id, state);
  return { state, alertError };
}

function morningLine(scan, state) {
  const price = priceOf(scan);
  const current = typeof price === "number"
    ? money(price)
    : "百亿补贴暂无匹配";
  const low = typeof state.historicalLow === "number"
    ? money(state.historicalLow)
    : "—";

  return (
    `${scan.short} NS2：${current} ｜ ` +
    `目标 ${money(scan.target)} ｜ 历史低 ${low}`
  );
}

async function sendMorningReport(env, scans, states, scheduledDate) {
  const beijing = beijingTime(scheduledDate);
  if (beijing.hour !== 8 || beijing.minute > 20) return false;

  const metaKey = "meta:lastDailyReportDate";
  const lastDate = await env.PRICE_STATE.get(metaKey);
  if (lastDate === beijing.date) return false;

  await bark(
    env,
    "☀️ 08:00 百亿补贴游戏晨报",
    scans.map(scan => morningLine(scan, states[scan.id])).join("\n")
  );
  await env.PRICE_STATE.put(metaKey, beijing.date);
  return true;
}

async function monitor(env, scheduledDate) {
  if (!env.PRICE_STATE) throw new Error("PRICE_STATE KV 未绑定");

  const scanResult = await scanAll(env);
  const states = {};
  const alertErrors = {};

  for (const scan of scanResult.scans) {
    const result = await processScan(env, scan, scheduledDate);
    states[scan.id] = result.state;
    if (result.alertError) alertErrors[scan.id] = result.alertError;
  }

  let morning = false;
  let morningError = null;
  try {
    morning = await sendMorningReport(
      env,
      scanResult.scans,
      states,
      scheduledDate
    );
  } catch (error) {
    morningError = String(error?.message || error);
  }

  return {
    ...scanResult,
    states,
    alertErrors,
    morning,
    morningError
  };
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export {
  GAMES,
  buildScan,
  isNS2,
  isPhysicalProduct,
  matchesGame,
  mergeItems
};

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/") {
        return new Response(
          `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>游戏价格雷达</title><body style="font-family:-apple-system;padding:30px;max-width:700px;margin:auto"><h1>游戏价格雷达</h1><p>每 10 分钟扫描多多进宝百亿补贴商品池。</p><p>王国之泪 NS2：≤ ¥280</p><p>空轨2nd NS2：≤ ¥400</p></body>`,
          {
            headers: {
              "content-type": "text/html; charset=utf-8"
            }
          }
        );
      }

      if (url.pathname === "/health") {
        return json({
          ok: true,
          pddConfigured: Boolean(
            env.PDD_CLIENT_ID && env.PDD_CLIENT_SECRET && env.PDD_PID
          ),
          kv: Boolean(env.PRICE_STATE),
          bark: Boolean(env.BARK_KEY),
          stateSchemaVersion: STATE_SCHEMA_VERSION,
          beijingTime: beijingTime(new Date()).iso
        });
      }

      if (url.pathname === "/scan") {
        return json({
          ok: true,
          mode: "DDK search + recommend；activity_tags=7 本地确认",
          recommendConfig: {
            limit: RECOMMEND_LIMIT,
            pagesPerPlan: RECOMMEND_PAGES,
            plans: RECOMMEND_PLANS
          },
          ...await scanAll(env)
        });
      }

      if (url.pathname === "/status") {
        const states = {};
        for (const game of GAMES) {
          states[game.id] = await getState(env, game.id);
        }

        return json({
          ok: true,
          stateSchemaVersion: STATE_SCHEMA_VERSION,
          states,
          lastDailyReportDate: await env.PRICE_STATE.get(
            "meta:lastDailyReportDate"
          )
        });
      }

      return new Response("Not Found", { status: 404 });
    } catch (error) {
      return json(
        {
          ok: false,
          error: String(error?.message || error)
        },
        500
      );
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      monitor(env, new Date(event.scheduledTime)).catch(error => {
        console.error("Monitor failed:", error?.message || error);
      })
    );
  }
};
