import { ethers } from "ethers";

export const OrderType = {
  MarketSwap: 0,
  LimitSwap: 1,
  MarketIncrease: 2,
  LimitIncrease: 3,
  MarketDecrease: 4,
  LimitDecrease: 5,
  StopLossDecrease: 6,
  Liquidation: 7,
  StopIncrease: 8,
};

export const DecreasePositionSwapType = {
  NoSwap: 0,
  SwapPnlTokenToCollateralToken: 1,
  SwapCollateralTokenToPnlToken: 2,
};

/**
 * Generates the initial market salt
 * @param {object} params Market parameters
 * @param {string} params.indexToken
 * @param {string} params.longToken
 * @param {string} params.shortToken
 * @param {string} params.marketType
 * @returns {string} bytes32 salt as a hex string
 */
export function getMarketSalt(params) {
  const { indexToken, longToken, shortToken, marketType } = params;

  const encoded = ethers.utils.defaultAbiCoder.encode(
    ["string", "address", "address", "address", "bytes32"],
    ["GMX_MARKET", indexToken, longToken, shortToken, marketType]
  );

  return ethers.utils.keccak256(encoded);
}

/**
 * Calculates the final market salt hash
 * @param {string} salt Initial salt generated from getMarketSalt
 * @returns {string} bytes32 hash as a hex string
 */
export function getMarketSaltHash(salt) {
  const MARKET_SALT = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(["string"], ["MARKET_SALT"])
  );

  const encoded = ethers.utils.defaultAbiCoder.encode(
    ["bytes32", "bytes32"],
    [MARKET_SALT, salt]
  );

  return ethers.utils.keccak256(encoded);
}

/**
 * Converts ETH to asset value
 * @param {string} chain
 * @param {string} native
 * @param {string} asset
 * @param {number} amount
 * @returns {Promise<object>} Conversion results
 */
export async function convertEthToAsset(chain, native, asset, amount) {
  const pricesResponse = await fetch(
    chain == "43113" || chain == "43114"
      ? "https://avalanche-api.gmxinfra.io/signed_prices/latest"
      : "https://arbitrum-api.gmxinfra.io/signed_prices/latest"
  );
  const { signedPrices } = await pricesResponse.json();
  const ethPriceData = signedPrices.find(
    (price) => price.tokenSymbol === native
  );
  const assetPriceData = signedPrices.find(
    (price) => price.tokenSymbol === asset
  );
  const avgEthPrice =
    (BigInt(ethPriceData.minPriceFull) + BigInt(ethPriceData.maxPriceFull)) /
    BigInt(2);
  console.log("ETH Price");
  console.log(avgEthPrice);
  const avgAssetPrice =
    (BigInt(assetPriceData.minPriceFull) +
      BigInt(assetPriceData.maxPriceFull)) /
    BigInt(2);
  console.log("Asset Price");
  console.log(avgAssetPrice);
  const usdAmount = BigInt(0.001 * 10 ** 12) * avgEthPrice;

  return {
    assetPriceInUSD:
      avgAssetPrice * 10n ** (asset == "SOL" || asset == "SUI" ? 9n : 10n),
    amountInUSD: usdAmount * 10n ** 6n,
    amountInETH: expandDecimals(0.001 * 10 ** 6, 12),
  };
}

/**
 * Expands a number by the specified number of decimals
 * @param {number} n
 * @param {number} decimals
 * @returns {bigint}
 */
export function expandDecimals(n, decimals) {
  return BigInt(n) * BigInt(10) ** BigInt(decimals);
}

/**
 * Converts a decimal to float representation
 * @param {number} value
 * @param {number} decimals
 * @returns {bigint}
 */
export function decimalToFloat(value, decimals = 0) {
  return expandDecimals(value, 30 - decimals);
}

/**
 * Gets the market token address
 * @param {ethers.Contract} dataStore
 * @param {string} indexToken
 * @param {string} longToken
 * @param {string} shortToken
 * @param {string} marketType
 * @returns {Promise<string>}
 */
export async function getMarketTokenAddress(
  dataStore,
  indexToken,
  longToken,
  shortToken,
  marketType
) {
  const marketSaltHash = getMarketSaltHash(
    getMarketSalt({
      indexToken,
      longToken,
      shortToken,
      marketType,
    })
  );
  console.log("Market Salt Hash");
  console.log(marketSaltHash);
  return await dataStore["getAddress(bytes32)"](marketSaltHash);
}