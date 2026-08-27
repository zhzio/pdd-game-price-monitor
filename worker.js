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

      "Accept-Language":
        "zh-CN,zh;q=0.9"
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
      captcha:
        /验证码|captcha|verify/i.test(text),

      login:
        /登录|login/i.test(text),

      risk:
        /访问受限|风险|异常|forbidden|anti.?bot/i.test(text)
    },

    markers,

    sample:
      text.slice(0, 3000)
  };
}

export default {
  async fetch(request) {
    try {
      const u = new URL(request.url);

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
    } catch (e) {
      return new Response(
        JSON.stringify(
          {
            error:
              String(e.message || e)
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
