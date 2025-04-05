// JavaScript version of the analysis system

function calculateVolatility(priceChanges: number[]) {
  const mean =
    priceChanges.reduce((sum: number, val: number) => sum + val, 0) /
    priceChanges.length;
  const squaredDiffs = priceChanges.map((val: number) =>
    Math.pow(val - mean, 2)
  );
  return Math.sqrt(
    squaredDiffs.reduce((sum: number, val: number) => sum + val, 0) /
      squaredDiffs.length
  );
}

function analyzeTrend(candles: { close: number; low: number; high: number }[]) {
  const prices = candles.map((c) => c.close);
  const priceChange = (prices[prices.length - 1] - prices[0]) / prices[0];

  // Simple trend direction determination
  const direction =
    priceChange > 0.02
      ? "bullish"
      : priceChange < -0.02
      ? "bearish"
      : "sideways";

  // Calculate trend strength using price consistency
  const strength = Math.min(Math.abs(priceChange) * 100, 100);

  return {
    direction,
    strength,
    keyLevels: {
      support: [Math.min(...candles.map((c) => c.low))],
      resistance: [Math.max(...candles.map((c) => c.high))],
    },
  };
}

async function processCandles(asset: string) {
  const url = `https://arbitrum-api.gmxinfra.io/prices/candles?tokenSymbol=${asset}&period=1d`;
  console.log("Fetching candles data from:", url);
  const response = await fetch(url);
  const { candles: rawCandles } = (await response.json()) as {
    candles: [number, number, number, number, number][];
  };
  const candles = rawCandles.map(
    ([timestamp, open, high, low, close]: [
      number,
      number,
      number,
      number,
      number
    ]) => ({
      timestamp,
      open,
      high,
      low,
      close,
    })
  );

  // Calculate price changes
  const priceChanges = candles
    .map((candle: { close: number }, i: number) =>
      i > 0 ? (candle.close - candles[i - 1].close) / candles[i - 1].close : 0
    )
    .slice(1);

  // Calculate volatility (using Exponential Moving Average of price changes)
  const volatility = calculateVolatility(priceChanges);

  // Identify trend
  const trendMetrics = analyzeTrend(candles);

  // Find volume profile
  const volumeProfile = {
    averageVolume: 0, // You'll need to add volume data to calculate this
    volumeSpikes: [], // Timestamps of significant volume increases
  };

  return {
    currentPrice: candles[candles.length - 1].close,
    priceChange24h:
      (candles[candles.length - 1].close - candles[0].close) / candles[0].close,
    volatility24h: volatility,
    volumeProfile,
    trendMetrics,
  };
}

export { processCandles };
