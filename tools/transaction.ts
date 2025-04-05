/**
 * Initialize the transaction tool
 */
export async function initializeTransactionTool() {
    // Add any initialization logic or environment variable checks here

    // Define examples of how to use this tool
    const examples = [
        {
            userQuery: "Example user query that would trigger this tool",
            toolInput: "The exact input that should be passed to the tool",
            toolOutput: JSON.stringify({
                // Sample output data structure
                result: "Sample result from the tool",
                additionalInfo: "Any additional information",
                timestamp: new Date().toISOString()
            }),
            finalResponse: "This is how the assistant should respond after receiving the tool output. It should incorporate the tool results in a natural, helpful way."
        },
        // Add at least one more example
        {
            userQuery: "Another example user query for this tool",
            toolInput: "Different input for the tool",
            toolOutput: JSON.stringify({
                result: "Different sample result",
                additionalInfo: "More information",
                timestamp: new Date().toISOString()
            }),
            finalResponse: "Another example of how the assistant should respond using these tool results."
        }
    ];

    return {
        name: "transaction",
        description: "Can perform an encoded tx data if passed in the prompt",
        examples: examples,
        execute: async (input, agent) => {
            try {
                console.log(`🔧 Executing transaction tool with input: "${input}"`);

                // Implement your tool logic here
                // This is where you'd call your API or perform your function

                // Mock response - replace with actual implementation
                const result = {
                    input,
                    result: "Your implementation here",
                    timestamp: new Date().toISOString()
                };

                return JSON.stringify(result);
            } catch (error) {
                console.error("Error with transaction tool:", error);
                if (error instanceof Error) {
                    return `Error executing transaction: ${error.message}`;
                }
                return "Error executing transaction: An unknown error occurred.";
            }
        },
    };
}
