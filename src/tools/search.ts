import { TavilySearchResults } from "@langchain/community/tools/tavily_search";

/**
 * Initialize the search tool using Tavily
 */
export async function initializeSearchTool() {
    if (!process.env.TAVILY_API_KEY) {
        console.log("⚠️ TAVILY_API_KEY not set, search tool unavailable");
        return null;
    }

    try {
        const tavilySearch = new TavilySearchResults({
            apiKey: process.env.TAVILY_API_KEY,
            maxResults: 3,
        });

        const examples = [
            {
                userQuery: "What's the latest news about SpaceX Starship?",
                toolInput: "latest SpaceX Starship news",
                toolOutput: JSON.stringify([
                    {
                        title: "SpaceX Starship completes successful orbital flight test",
                        url: "https://example.com/spacex-news",
                        content: "SpaceX's Starship rocket completed its latest test flight yesterday, reaching orbit for the third time before landing successfully in the Pacific Ocean.",
                    },
                ]),
                finalResponse: "SpaceX's Starship rocket recently completed its latest test flight, successfully reaching orbit for the third time before landing in the Pacific Ocean. This marks another milestone in SpaceX's development of the Starship platform, which is designed for missions to the Moon and Mars.",
            },
            {
                userQuery: "Who is the current CEO of Microsoft?",
                toolInput: "current CEO of Microsoft",
                toolOutput: JSON.stringify([
                    {
                        title: "Microsoft Leadership - Official Site",
                        url: "https://example.com/microsoft-leadership",
                        content: "Satya Nadella is the Chairman and Chief Executive Officer of Microsoft. He was appointed CEO in February 2014.",
                    },
                ]),
                finalResponse: "The current CEO of Microsoft is Satya Nadella. He has been serving as CEO since February 2014 and is also the Chairman of Microsoft. Prior to becoming CEO, Nadella was Executive Vice President of Microsoft's Cloud and Enterprise group.",
            },
        ];

        return {
            name: "search",
            description: "Search the web for current information on a topic or question",
            examples: examples,
            execute: async (query, agent) => {
                try {
                    console.log(`🔍 Executing search for: "${query}"`);
                    const results = await tavilySearch.invoke(query);
                    return JSON.stringify(results);
                } catch (error) {
                    console.error("Error with search tool:", error);
                    if (error instanceof Error) {
                        return `Error performing search: ${error.message}`;
                    } else {
                        return "Error performing search: An unknown error occurred.";
                    }
                }
            }
        };
    } catch (error) {
        console.error("Failed to initialize Tavily search:", error);
        return null;
    }
}
