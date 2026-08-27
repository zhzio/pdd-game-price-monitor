async function md5Upper(text) {
  const bytes = new TextEncoder().encode(text);

  const hash = await crypto.subtle.digest(
    "MD5",
    bytes
  );

  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}


async function createPddSign(params, secret) {
  const keys = Object.keys(params).sort();

  let source = secret;

  for (const key of keys) {
    source += key + params[key];
  }

  source += secret;

  return await md5Upper(source);
}


async function searchPdd(
  keyword,
  env,
  billionOnly = false
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
    type: "pdd.ddk.goods.search",

    client_id:
      env.PDD_CLIENT_ID,

    timestamp:
      String(
        Math.floor(Date.now() / 1000)
      ),

    data_type: "JSON",

    version: "V1",

    keyword,

    pid:
      env.PDD_PID,

    page: "1",

    page_size: "20"
  };


  // 百亿补贴筛选
  if (billionOnly) {
    params.activity_tags =
      JSON.stringify([7]);
  }


  params.sign =
    await createPddSign(
      params,
      env.PDD_CLIENT_SECRET
    );


  const body =
    new URLSearchParams();

  for (
    const [key, value]
    of Object.entries(params)
  ) {
    body.set(key, value);
  }


  const response = await fetch(
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


  const rawText =
    await response.text();


  let data;

  try {
    data =
      JSON.parse(rawText);
  } catch {
    return {
      ok: false,

      stage:
        "parse_response",

      httpStatus:
        response.status,

      message:
        "接口返回的不是 JSON",

      sample:
        rawText.slice(0, 1000)
    };
  }


  if (data.error_response) {
    return {
      ok: false,

      stage:
        "pdd_api",

      httpStatus:
        response.status,

      keyword,

      billionOnly,

      error:
        data.error_response
    };
  }


  const result =
    data.goods_search_response || {};


  const goods =
    Array.isArray(result.goods_list)
      ? result.goods_list
      : [];


  const simplified =
    goods.map((g) => {

      const price =
        typeof g.min_group_price === "number"
          ? g.min_group_price / 100
          : null;


      const normalPrice =
        typeof g.min_normal_price === "number"
          ? g.min_normal_price / 100
          : null;


      const couponDiscount =
        typeof g.coupon_discount === "number"
          ? g.coupon_discount / 100
          : 0;


      const afterCouponPrice =
        price !== null
          ? Math.max(
              0,
              price - couponDiscount
            )
          : null;


      return {
        goodsName:
          g.goods_name || null,

        goodsSign:
          g.goods_sign || null,

        mallName:
          g.mall_name || null,

        price,

        normalPrice,

        hasCoupon:
          Boolean(g.has_coupon),

        couponDiscount,

        afterCouponPrice,

        sales:
          g.sales_tip ??
          g.sold_quantity ??
          null,

        activityTags:
          g.activity_tags || [],

        image:
          g.goods_thumbnail_url ||
          g.goods_image_url ||
          null
      };
    });


  // 默认按照实际可能支付价格从低到高
  simplified.sort(
    (a, b) => {

      const aPrice =
        a.afterCouponPrice ??
        a.price ??
        Infinity;

      const bPrice =
        b.afterCouponPrice ??
        b.price ??
        Infinity;

      return aPrice - bPrice;
    }
  );


  return {
    ok: true,

    source:
      "pdd.ddk.goods.search",

    keyword,

    billionOnly,

    total:
      result.total_count ??
      simplified.length,

    count:
      simplified.length,

    listId:
      result.list_id || null,

    goods:
      simplified
  };
}


function homepage() {
  return `
<!DOCTYPE html>
<html lang="zh-CN">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>
游戏卡带价格雷达
</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;

  display: flex;
  align-items: center;
  justify-content: center;

  padding: 24px;

  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;

  background: #f5f6f8;
  color: #111827;
}

.card {
  width: 100%;
  max-width: 680px;

  background: white;

  border: 1px solid #e5e7eb;
  border-radius: 24px;

  padding: 32px;

  box-shadow:
    0 16px 40px
    rgba(0,0,0,.06);
}

.badge {
  display: inline-block;

  padding: 6px 12px;

  border-radius: 999px;

  background: #eef6ff;
  color: #2563eb;

  font-size: 14px;
  font-weight: 600;
}

h1 {
  margin: 18px 0 12px;
  font-size: 32px;
}

.description {
  color: #4b5563;
  line-height: 1.8;
}

.grid {
  display: grid;

  grid-template-columns:
    repeat(3, 1fr);

  gap: 12px;

  margin-top: 26px;
}

.item {
  padding: 16px;

  border-radius: 16px;

  background: #f9fafb;
  border: 1px solid #edf0f3;
}

.item strong {
  display: block;
  margin-bottom: 7px;
}

.item span {
  color: #6b7280;
  font-size: 13px;
  line-height: 1.5;
}

footer {
  margin-top: 26px;
  padding-top: 18px;

  border-top:
    1px solid #edf0f3;

  color: #9ca3af;
  font-size: 12px;
  line-height: 1.7;
}

@media(max-width:600px) {

  .card {
    padding: 24px 20px;
  }

  h1 {
    font-size: 27px;
  }

  .grid {
    grid-template-columns: 1fr;
  }
}

</style>

</head>


<body>

<main class="card">

<span class="badge">
开发测试中
</span>

<h1>
游戏卡带价格雷达
</h1>

<div class="description">

用于查询和观察公开游戏实体商品价格变化，
为购买决策提供参考。

<br><br>

价格及商品状态以对应平台实际展示为准。

</div>


<div class="grid">

<div class="item">

<strong>
价格查询
</strong>

<span>
查询公开商品与价格信息
</span>

</div>


<div class="item">

<strong>
低价排序
</strong>

<span>
辅助寻找更低价格商品
</span>

</div>


<div class="item">

<strong>
价格提醒
</strong>

<span>
仅提供提醒，不自动下单
</span>

</div>

</div>


<footer>

独立开发测试项目，
与任何电商平台不存在官方隶属关系。

<br>

不提供自动购买、自动下单或支付服务。

</footer>

</main>

</body>

</html>
`;
}


export default {

  async fetch(request, env) {

    try {

      const url =
        new URL(request.url);


      /*
       * 首页
       */
      if (
        url.pathname === "/" ||
        url.pathname === ""
      ) {

        return new Response(
          homepage(),
          {
            headers: {
              "content-type":
                "text/html;charset=UTF-8"
            }
          }
        );
      }


      /*
       * 配置检查
       */
      if (
        url.pathname === "/health"
      ) {

        return Response.json({
          ok: true,

          service:
            "game-price-radar",

          pddClientIdConfigured:
            Boolean(
              env.PDD_CLIENT_ID
            ),

          pddClientSecretConfigured:
            Boolean(
              env.PDD_CLIENT_SECRET
            ),

          pddPidConfigured:
            Boolean(
              env.PDD_PID
            ),

          time:
            new Date().toISOString()
        });
      }


      /*
       * 商品搜索
       *
       * 示例：
       *
       * /api?q=塞尔达传说王国之泪
       *
       * 百亿补贴：
       *
       * /api?q=塞尔达传说王国之泪&billion=1
       */
      if (
        url.pathname === "/api"
      ) {

        const keyword =
          (
            url.searchParams.get("q") ||

            "塞尔达传说 王国之泪 Switch 卡带"
          ).trim();


        const billionOnly =
          url.searchParams
            .get("billion") === "1";


        if (!keyword) {

          return Response.json(
            {
              ok: false,

              error:
                "请输入搜索关键词"
            },
            {
              status: 400
            }
          );
        }


        const result =
          await searchPdd(
            keyword,
            env,
            billionOnly
          );


        return new Response(
          JSON.stringify(
            result,
            null,
            2
          ),
          {
            headers: {

              "content-type":
                "application/json;charset=UTF-8",

              "cache-control":
                "no-store"
            }
          }
        );
      }


      return new Response(
        "Not Found",
        {
          status: 404
        }
      );


    } catch (error) {

      return new Response(
        JSON.stringify(
          {
            ok: false,

            error:
              String(
                error?.message ||
                error
              )
          },
          null,
          2
        ),
        {
          status: 500,

          headers: {

            "content-type":
              "application/json;charset=UTF-8",

            "cache-control":
              "no-store"
          }
        }
      );
    }
  }
};
