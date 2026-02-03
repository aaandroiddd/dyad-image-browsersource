/* eslint-env node */

import type { IncomingMessage, ServerResponse } from "http";

export default async function handler(req: IncomingMessage & { body?: any }, res: ServerResponse & { json?: (body: unknown) => void }) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  const bodyChunks: Uint8Array[] = [];
  for await (const chunk of req) {
    bodyChunks.push(chunk);
  }
  const bodyString = Buffer.concat(bodyChunks).toString();
  const { priceId } = JSON.parse(bodyString || "{}");

  const base = process.env.SITE_URL ?? "https://example.com";
  const params = new URLSearchParams();
  params.append("mode", "payment");
  params.append("success_url", `${base}/buy-now/success`);
  params.append("cancel_url", `${base}/buy-now/cancel`);
  if (priceId) {
    params.append("line_items[0][price]", priceId);
    params.append("line_items[0][quantity]", "1");
  }

  const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const session = await stripeRes.json();
  res.setHeader("Content-Type", "application/json");
  res.statusCode = 200;
  res.end(JSON.stringify(session));
}

