// scripts/gmp.js

const symbol = "AAPL"; // change to any ticker

// Yahoo Finance: monthly interval, 1-year range
const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1mo&range=1y`;

async function run() {
  const resp = await fetch(url);
  const json = await resp.json();

  if (!json.chart || !json.chart.result) {
    console.error("❌ Error fetching data:", json);
    return;
  }

  const result = json.chart.result[0];
  const timestamps = result.timestamp;
  const closes = result.indicators.quote[0].close;

  const data = timestamps.map((t, i) => ({
    month: new Date(t * 1000).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    }),
    close: closes[i],
  }));

  console.log(`📈 12 Month Monthly Performance for ${symbol}`);
  console.table(data);
}

run();
