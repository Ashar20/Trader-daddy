/**
 * Generates a prompt for embeddings based on trade play, market data, and sentiment
 * @param {Object} asset - The asset to analyze
 * @param {Object} marketData - The processed market data
 * @param {Object} sentiment - The processed sentiment data
 * @returns {string} - The formatted prompt
 */
function generateEmbeddingsPrompt(
    asset,
    marketData,
    sentiment
) {
    return `Analyze trading opportunity for ${asset}:

Market Context:
- Current Price: ${marketData.currentPrice}
- 24h Change: ${(marketData.priceChange24h * 100).toFixed(2)}%
- Volatility: ${(marketData.volatility24h * 100).toFixed(2)}%
- Trend: ${marketData.trendMetrics.direction} (Strength: ${marketData.trendMetrics.strength})

Social Sentiment:
- Overall Score: ${sentiment.overallSentiment}
- Key Influencers: ${sentiment.topInfluencers.join(', ')}
- Recent Narratives: ${sentiment.keyPhrases.slice(0, 2).join(' | ')}

Analyze for:
1. Pattern confirmation
2. Risk levels
3. Market psychology
4. Position sizing
5. Exit strategy optimization`;
}

/**
 * Generates embeddings by sending a request to the Supavec API
 * @param {Object} tradePlay - The trade play information
 * @param {Object} marketData - The processed market data
 * @param {Object} sentiment - The processed sentiment data
 * @returns {Promise<string>} - A promise that resolves to the formatted embeddings
 */
export async function generateEmbeddings(
    asset,
    marketData,
    sentiment
) {
    const prompt = generateEmbeddingsPrompt(asset, marketData, sentiment);
    const file_ids = ["40f0b3c7-8b2d-4071-a066-a92cfa13ee05", "4d164884-4eb4-4f44-a4f8-755270d4736e", "6d3c84e9-3c16-4487-95e8-a3941a956bf8", "fa2e52c2-cb56-4491-b0b0-bde9e0a9607d", "94c868e2-262e-45ab-be23-47be5028361d", "284c006d-fbba-43df-8ef7-4c2bbfa856af"]

    const response = await fetch("https://api.supavec.com/embeddings", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            authorization: process.env.SUPAVEC_API_KEY || "",
        },
        body: JSON.stringify({ query: prompt, file_ids }),
    });
    let formattedEmbeddings = "Technical Anlaysis Report:\n\n"

    const { success, documents } = await response.json();
    if (success) {
        documents.forEach(({ content, file_id, score }, index) => {
            console.log(file_id)
            formattedEmbeddings += `Report ${index + 1}\nScore: ${score}\n`
            formattedEmbeddings += `${content}\n`

        })
    } else {
        console.error("Failed to generate retrieval embeddings");
        return ""
    }

    return formattedEmbeddings + "\n";
}