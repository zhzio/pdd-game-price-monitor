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


async function createSign(params, secret) {
  const keys = Object.keys(params).sort();

  let source = secret;

  for (const key of keys) {
    source += key + params[key];
  }

  source += secret;

  return await md5Upper(source);
}


async function pddCall(env, extraParams) {
  if (!env.PDD_CLIENT_ID) {
    throw new Error("未设置 PDD_CLIENT_ID");
  }

  if (!env.PDD_CLIENT_SECRET) {
    throw new Error("未设置 PDD_CLIENT_SECRET");
  }

  const params = {
    client_id: env.PDD_CLIENT_ID,

    timestamp:
      String(
        Math.floor(Date.now() / 1000)
      ),

    data_type: "JSON",

    version: "V1",

    ...extraParams
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
    body.set(key, String(value));
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


  const text =
    await response.text();


  try {
    return JSON.parse(text);
  } catch {
    return {
      error_response: {
        error_msg:
          "接口返回的不是 JSON",

        raw:
          text.slice(0, 1000)
      }
    };
  }
}


async function searchPdd(
  keyword,
  env,
  billionOnly = false
) {
  if (!env.PDD_PID) {
    throw new Error(
      "未设置 PDD_PID"
    );
  }


  const params = {
    type:
      "pdd.ddk.goods.search",

    keyword,

    pid:
      env.PDD_PID,

    page:
      "1",

    page_size:
      "20"
  };


  if (billionOnly) {
    params.activity_tags =
      JSON.stringify([7]);
  }


  const data =
    await pddCall(
      env,
      params
    );


  if (data.error_response) {
    return {
      ok: false,

      stage:
        "pdd_api",

      keyword,

      billionOnly,

      error:
        data.error_response
    };
  }


  const result =
    data.goods_search_response || {};


  const goods =
    Array.isArray(
      result.goods_list
    )
      ? result.goods_list
      : [];


  const simplified =
    goods.map((g) => {

      const price =
        typeof g.min_group_price ===
        "number"
          ? g.min_group_price / 100
          : null;


      const coupon =
        typeof g.coupon_discount ===
        "number"
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

        activityTags:
          g.activity_tags || [],

        sales:
          g.sales_tip ??
          g.sold_quantity ??
          null,

        image:
          g.goods_thumbnail_url ||
          g.goods_image_url ||
          null
      };
    });


  simplified.sort(
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
    ok: true,

    source:
      "pdd.ddk.goods.search",

    keyword,

    billionOnly,

    count:
      simplified.length,

    total:
      result.total_count ??
      simplified.length,

    goods:
      simplified
  };
}


async function createBindUrl(env) {
  if (!env.PDD_PID) {
    throw new Error(
      "未设置 PDD_PID"
    );
  }


  const data =
    await pddCall(
      env,
      {
        type:
          "pdd.ddk.rp.prom.url.generate",

        channel_type:
          "10",

        p_id_list:
          JSON.stringify([
            env.PDD_PID
          ])
      }
    );


  if (data.error_response) {
    return {
      ok: false,

      error:
        data.error_response
    };
  }


  const result =
    data
      .rp_promotion_url_generate_response ||
    {};


  const item =
    Array.isArray(
      result.url_list
    )
      ? result.url_list[0]
      : null;


  return {
    ok: true,

    message:
      "打开 bindUrl 完成拼多多授权备案",

    bindUrl:
      item?.mobile_url ||
      item?.url ||
      null,

    urlList:
      result.url_list || []
  };
}


async function checkAuthority(env) {
  if (!env.PDD_PID) {
    throw new Error(
      "未设置 PDD_PID"
    );
  }


  const data =
    await pddCall(
      env,
      {
        type:
          "pdd.ddk.member.authority.query",

        pid:
          env.PDD_PID
      }
    );


  if (data.error_response) {
    return {
      ok: false,

      error:
        data.error_response
    };
  }


  const result =
    data.authority_query_response ||
    {};


  return {
    ok: true,

    bind:
      result.bind ?? null,

    registered:
      Number(
        result.bind
      ) === 1
  };
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
  margin: 0;
  padding: 24px;

  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;

  background:
    #f5f6f8;

  color:
    #111827;
}

.card {
  max-width:
    650px;

  margin:
    60px auto;

  background:
    white;

  padding:
    30px;

  border-radius:
    22px;

  box-shadow:
    0 12px 36px
    rgba(0,0,0,.07);
}

.badge {
  display:
    inline-block;

  background:
    #eef6ff;

  color:
    #2563eb;

  padding:
    6px 12px;

  border-radius:
    999px;

  font-size:
    14px;
}

h1 {
  font-size:
    30px;

  margin:
    18px 0 12px;
}

p {
  color:
    #4b5563;

  line-height:
    1.8;
}

footer {
  margin-top:
    24px;

  padding-top:
    18px;

  border-top:
    1px solid #eee;

  font-size:
    12px;

  color:
    #9ca3af;

  line-height:
    1.7;
}

</style>

</head>

<body>

<div class="card">

<span class="badge">
开发测试中
</span>

<h1>
游戏卡带价格雷达
</h1>

<p>
用于查询公开游戏实体商品信息与价格变化，
辅助进行价格比较和购买决策。
</p>

<p>
本工具仅提供商品与价格信息，
不提供自动下单或支付服务。
</p>

<footer>
独立开发测试项目，
与任何电商平台不存在官方隶属关系。
</footer>

</div>

</body>

</html>
`;
}


export default {

  async fetch(request, env) {

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
                "text/html;charset=UTF-8"
            }
          }
        );
      }


      if (
        url.pathname ===
        "/health"
      ) {

        return Response.json({
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
            )
        });
      }


      if (
        url.pathname ===
        "/bind"
      ) {

        const result =
          await createBindUrl(
            env
          );

        return Response.json(
          result
        );
      }


      if (
        url.pathname ===
        "/authority"
      ) {

        const result =
          await checkAuthority(
            env
          );

        return Response.json(
          result
        );
      }


      if (
        url.pathname ===
        "/api"
      ) {

        const keyword =
          (
            url.searchParams
              .get("q") ||

            "塞尔达传说 王国之泪"
          ).trim();


        const billionOnly =
          url.searchParams
            .get("billion") ===
          "1";


        const result =
          await searchPdd(
            keyword,
            env,
            billionOnly
          );


        return Response.json(
          result,
          {
            headers: {
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

      return Response.json(
        {
          ok: false,

          error:
            String(
              error?.message ||
              error
            )
        },
        {
          status: 500
        }
      );
    }
  }
};
