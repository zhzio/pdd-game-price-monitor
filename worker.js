function contexts(text, keyword, max = 3) {
  const out = [];
  let start = 0;

  while (out.length < max) {
    const i = text.indexOf(keyword, start);
    if (i === -1) break;

    out.push(
      text.slice(
        Math.max(0, i - 180),
        Math.min(text.length, i + 420)
      )
    );

    start = i + keyword.length;
  }

  return out;
}

async function probePdd(keyword) {
  const url =
    "https://mobile.yangkeduo.com/search_result.html" +
    `?search_key=${encodeURIComponent(keyword)}` +
    "&search_type=goods&source=index";

  const r = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) " +
        "AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9"
    }
  });

  const text = await r.text();

  const keys = [
    "goods_id",
    "goodsId",
    "goods_name",
    "goodsName",
    "min_group_price",
    "group_price",
    "normal_price",
    "price",
    "百亿补贴"
  ];

  const markers = {};

  for (const key of keys) {
    markers[key] = {
      count: text.split(key).length - 1,
      samples: contexts(text, key)
    };
  }

  const goodsIdMatches = [
    ...text.matchAll(
      /(?:\"goods_id\"\s*:\s*\"?(\d+)|goods_id=(\d+)|\"goodsId\"\s*:\s*\"?(\d+))/g
    )
  ];

  const goodsIds = [
    ...new Set(
      goodsIdMatches
        .map((m) => m[1] || m[2] || m[3])
        .filter(Boolean)
    )
  ].slice(0, 30);

  return {
    keyword,
    response: {
      status: r.status,
      ok: r.ok,
      finalUrl: r.url,
      htmlLength: text.length
    },
    content: {
      containsKeyword: text.includes(keyword),
      goodsIdCount: goodsIdMatches.length,
      goodsIds
    },
    challengeHints: {
      captcha: /验证码|captcha|verify/i.test(text),
      login: /登录|login/i.test(text),
      risk: /访问受限|风险|异常|forbidden|anti.?bot/i.test(text)
    },
    markers,
    sample: text.slice(0, 3000)
  };
}

function homepage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>游戏卡带价格雷达</title>
  <style>
    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f6f7f9;
      color: #111827;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .card {
      width: min(680px, 100%);
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 24px;
      padding: 34px;
      box-shadow: 0 14px 40px rgba(0,0,0,.06);
    }

    .badge {
      display: inline-block;
      padding: 7px 12px;
      border-radius: 999px;
      background: #eef6ff;
      color: #2563eb;
      font-size: 14px;
      font-weight: 600;
    }

    h1 {
      margin: 18px 0 12px;
      font-size: 34px;
      line-height: 1.2;
    }

    p {
      margin: 0;
      color: #4b5563;
      font-size: 16px;
      line-height: 1.8;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-top: 26px;
    }

    .item {
      padding: 16px;
      border-radius: 16px;
      background: #f9fafb;
      border: 1px solid #eef0f3;
    }

    .item strong {
      display: block;
      margin-bottom: 6px;
      font-size: 15px;
    }

    .item span {
      color: #6b7280;
      font-size: 13px;
      line-height: 1.5;
    }

    footer {
      margin-top: 26px;
      padding-top: 18px;
      border-top: 1px solid #eef0f3;
      color: #9ca3af;
      font-size: 12px;
      line-height: 1.6;
    }

    @media (max-width: 600px) {
      .card {
        padding: 26px 22px;
        border-radius: 20px;
      }

      h1 {
        font-size: 28px;
      }

      .grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main class="card">
    <span class="badge">开发测试中</span>

    <h1>游戏卡带价格雷达</h1>

    <p>
      用于查询和观察公开游戏实体商品的价格变化，
      为购买决策提供参考。当前项目处于开发测试阶段，
      价格与商品状态以对应平台实际展示为准。
    </p>

    <section class="grid">
      <div class="item">
        <strong>价格查询</strong>
        <span>检索公开商品信息与价格。</span>
      </div>

      <div class="item">
        <strong>价格变化</strong>
        <span>记录并观察价格波动趋势。</span>
      </div>

      <div class="item">
        <strong>购买提醒</strong>
        <span>仅提供信息提醒，不提供自动下单。</span>
      </div>
    </section>

    <footer>
      本工具为独立开发测试项目，与任何电商平台不存在官方隶属关系。
      不提供自动购买、自动下单或支付服务。
    </footer>
  </main>
</body>
</html>`;
}

export default {
  async fetch(request) {
    try {
      const u = new URL(request.url);

      if (u.pathname === "/" || u.pathname === "") {
        return new Response(homepage(), {
          headers: {
            "content-type": "text/html;charset=UTF-8"
          }
        });
      }

      if (u.pathname === "/health") {
        return Response.json({
          ok: true,
          service: "game-price-radar"
        });
      }

      if (u.pathname === "/api") {
        const keyword = (
          u.searchParams.get("q") ||
          "塞尔达传说 王国之泪 Switch 卡带"
        ).trim();

        const result = await probePdd(keyword);

        return new Response(
          JSON.stringify(result, null, 2),
          {
            headers: {
              "content-type":
                "application/json;charset=UTF-8"
            }
          }
        );
      }

      return new Response("Not Found", {
        status: 404
      });

    } catch (e) {
      return new Response(
        JSON.stringify(
          {
            error: String(e.message || e)
          },
          null,
          2
        ),
        {
          status: 500,
          headers: {
            "content-type":
              "application/json;charset=UTF-8"
          }
        }
      );
    }
  }
};
