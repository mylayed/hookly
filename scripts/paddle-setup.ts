// Creates the Hookly Pro product and its monthly price in Paddle, once.
// Safe to re-run: an existing "Hookly Pro" product and price are reused.
//
//   npm run paddle:setup -- --amount 9 --currency USD
//
// Uses PADDLE_API_KEY from .env.local (a sandbox key first; for live, run it
// again with the live key). Put the printed price id in PADDLE_PRO_PRICE_ID.
import { paddle, paddleEnv, type PaddlePrice } from "../src/lib/paddle";
import { arg } from "./_shared";

const PRODUCT_NAME = "Hookly Pro";

async function main() {
  const env = paddleEnv();
  const products = await paddle<{ id: string; name: string }[]>("GET", "/products?status=active&per_page=200");
  let product = products.find((p) => p.name === PRODUCT_NAME);

  if (product) {
    const prices = await paddle<PaddlePrice[]>("GET", `/prices?product_id=${product.id}&status=active`);
    const monthly = prices.find((p) => p.billing_cycle?.interval === "month");
    if (monthly) {
      const amount = Number(monthly.unit_price.amount) / 100;
      console.log(`[${env}] ${PRODUCT_NAME} already exists.`);
      console.log(`PADDLE_PRO_PRICE_ID=${monthly.id}   (${amount} ${monthly.unit_price.currency_code}/month)`);
      return;
    }
  }

  const amount = Number(arg("amount") ?? 9);
  const currency = (arg("currency") ?? "USD").toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("--amount must be a positive number, e.g. 9");

  product ??= await paddle<{ id: string; name: string }>("POST", "/products", {
    name: PRODUCT_NAME,
    description: "Higher daily limits for script checks, hooks and rewrites.",
    tax_category: "standard",
  });
  const price = await paddle<PaddlePrice>("POST", "/prices", {
    product_id: product.id,
    description: "Monthly",
    unit_price: { amount: String(Math.round(amount * 100)), currency_code: currency },
    billing_cycle: { interval: "month", frequency: 1 },
  });
  console.log(`[${env}] Created ${PRODUCT_NAME} (${amount} ${currency}/month).`);
  console.log(`PADDLE_PRO_PRICE_ID=${price.id}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
